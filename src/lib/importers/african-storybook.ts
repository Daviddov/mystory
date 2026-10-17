/**
 * African Storybook importer.
 *
 * African Storybook (https://www.africanstorybook.org) publishes picture books
 * under CC BY and CC BY-NC. The Global African Storybook Project keeps the
 * texts of 364 of them, extracted from the project's PDFs, in two GitHub
 * repositories (branch master):
 *
 *   global-asp/asp-source
 *     <lang>/README.md                 a table: story number, title, link to the original, license
 *     <lang>/<number>_<name>.md        "# Title", then the pages separated by a line holding only "##";
 *                                      the last section is metadata: "* License: [CC-BY]", "* Text: ...",
 *                                      "* Illustration: ...", "* Translated By: ...", "* Language: en"
 *   global-asp/asp-imagebank
 *     README.md                        a table: story number, title, illustrators, license
 *     medium/<number>/01.jpg, 02.jpg   the pictures of a story, without any text in them
 *
 * The story file never names its pictures. They are matched by position:
 * 01.jpg is the cover and picture N+1 belongs to page N (the Nth section after
 * the title). Many stories have one more picture after the last page, the back
 * cover, which is not imported. A story whose picture count fits neither
 * layout is refused, because its pages could not be matched with certainty.
 *
 * License: the story file says only "CC-BY" or "CC-BY-NC"; the version (3.0 or
 * 4.0) is found only in the link of the language README. A story is imported
 * when the file, the README and the image bank all say CC BY and the version
 * is one this site can record (see ./cc.ts). Everything else is refused.
 *
 * The links of the README to africanstorybook.org are dead (the site was
 * rebuilt), so Book.source is the story file on GitHub. The source asks for no
 * particular attribution sentence, so none is stored.
 *
 * No "server-only" import and no getRepo(): the CLI (scripts/import-african-storybook.ts)
 * runs this under tsx. All network access goes through an injectable fetch.
 */
import { estimateReadingMinutes } from "../hebrew";
import { BOOK_LIMITS } from "../limits";
import type { MediaStore } from "../media/types";
import { putImage, prepareImage, type PreparedImage } from "../media/optimize";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { Repository } from "../repo/types";
import { SLUG_PATTERN, type BookCredits, type BookWithPages, type Page } from "../types";
import type { FetchLike } from "./bookdash";
import { getCcLicense } from "./cc";
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AFRICAN_STORYBOOK = {
  publisher: "African Storybook",
  publisherUrl: "https://www.africanstorybook.org",
  /** The only license family imported; the version comes from the language README. */
  licenseName: "CC BY",
  /** Folder of asp-source that is read. */
  language: "en",
  sourceRepo: "global-asp/asp-source",
  imageRepo: "global-asp/asp-imagebank",
  branch: "master",
  sourceRawBase: "https://raw.githubusercontent.com/global-asp/asp-source/master",
  imageRawBase: "https://raw.githubusercontent.com/global-asp/asp-imagebank/master",
  apiBase: "https://api.github.com/repos/global-asp/asp-source/contents",
  /** Picture 01 of a story is its cover; picture N + 1 belongs to page N. */
  coverImage: 1,
} as const;

/** Longest markdown or README file accepted. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
/** Story files are "<4 digits>_<name>.md"; the name may hold dots and underscores. */
const STORY_FILE = /^(\d{4})_([A-Za-z0-9][A-Za-z0-9._-]{0,120})\.md$/;

/**
 * The four-digit story number of "10", "0010", "asp-0010" or a file name such
 * as "0010_the-animals-of-uganda.md". Null for anything else.
 */
export function africanStorybookNumber(input: string): string | null {
  const match = /^(?:asp-)?(\d{1,4})(?:_[A-Za-z0-9][A-Za-z0-9._-]*)?$/i.exec(input.trim().replace(/\.md$/i, ""));
  if (!match || Number(match[1]) === 0) return null;
  return match[1].padStart(4, "0");
}

/** Stable id of the local copy of a story: one copy per site, found again by story number. */
export function africanStorybookBookId(number: string): string {
  return `asp-${number}`;
}

/** Where the imported text lives; stored in Book.source. */
export function africanStorybookSourceUrl(file: string): string {
  return `https://github.com/${AFRICAN_STORYBOOK.sourceRepo}/blob/${AFRICAN_STORYBOOK.branch}/${AFRICAN_STORYBOOK.language}/${encodeURIComponent(file)}`;
}

export type AfricanStorybookErrorCode =
  | "invalid-id"
  | "not-found"
  | "rate-limited"
  | "network"
  | "invalid-book"
  | "no-text"
  | "no-images"
  | "license"
  | "media";

const USER_MESSAGES: Record<AfricanStorybookErrorCode, string> = {
  "invalid-id": "מספר הסיפור במאגר אינו תקין.",
  "not-found": "הסיפור לא נמצא במאגר של African Storybook (או שאין לו מהדורה באנגלית).",
  "rate-limited": "GitHub הגביל זמנית את מספר הבקשות. נסו שוב בעוד כמה דקות, או הגדירו GITHUB_TOKEN.",
  network: "לא הצלחנו להתחבר למאגר של African Storybook. בדקו את החיבור ונסו שוב.",
  "invalid-book": "קובץ הסיפור במאגר אינו במבנה הצפוי, ולכן לא יובא.",
  "no-text": "לסיפור הזה יש רק איורים, בלי טקסט, ולכן אי אפשר לייבא אותו.",
  "no-images": "לסיפור הזה אין איורים במאגר התמונות, ולכן הוא לא יובא.",
  license: "הרישיון של הסיפור אינו CC BY בגרסה שאפשר לרשום באתר, ולכן הוא לא יובא.",
  media: "אחת התמונות של הסיפור חסרה, גדולה מדי או אינה תמונה תקינה.",
};

/** A refused or failed import. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class AfricanStorybookError extends Error {
  readonly code: AfricanStorybookErrorCode;
  readonly userMessage: string;

  constructor(code: AfricanStorybookErrorCode, detail?: string) {
    super(detail ? `african storybook import failed (${code}): ${detail}` : `african storybook import failed (${code})`);
    this.name = "AfricanStorybookError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

export interface ParsedAfricanStorybookStory {
  /** From the "# Title" line. Empty when the file has none. */
  title: string;
  /**
   * Text of every section between the title and the metadata, in order;
   * paragraphs are separated by a newline. A section without text stays in
   * the list as "", because the position is what ties a page to its picture.
   */
  pages: string[];
  /** License as the file names it, without a version: "CC BY", "CC BY-NC". Empty when not stated. */
  license: string;
  /** "Text:" of the metadata. Empty when not stated. */
  author: string;
  /** "Illustration:" of the metadata. Empty when not stated. */
  illustrator: string;
  /** "Translated By:" or "Translation:" of the metadata. */
  translator: string;
  /** "Adaptation:" of the metadata. */
  adaptation: string;
  /** "Language:" of the metadata, an ISO code. */
  language: string;
  /** Free text under the metadata list, where some stories carry a one line description. */
  description: string;
  /** Things a person should look at (never fatal). */
  warnings: string[];
}

const PAGE_BREAK = /^##[ \t]*$/;
const METADATA_LINE = /^\*\s+([A-Za-z][A-Za-z ]{0,30}?)\s*:\s*(.*)$/;

/** "[CC-BY]", "CC-BY-NC", "cc by" → "CC BY", "CC BY-NC". Empty for anything that is not a CC BY family name. */
export function africanStorybookLicenseName(raw: string): string {
  const match = /^\[?\s*CC[- ]BY((?:-(?:NC|SA|ND))*)\s*\]?$/i.exec(raw.trim());
  return match ? `CC BY${match[1].toUpperCase()}` : "";
}

/** Removes inline markdown that would otherwise be read aloud: emphasis markers, links, escapes. */
function plainInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(?<![\w*])([*_])(?=\S)(.+?)(?<=\S)\1(?![\w*])/g, "$2")
    .replace(/\\([*_#[\]()!`\\])/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[ \t ]+/g, " ")
    .trim();
}

/**
 * Text of one section. The lines are wrapped where the PDF wrapped them, so a
 * line break is only a space; an empty line ends a paragraph.
 */
function sectionText(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(" "));
    current = [];
  };
  for (const raw of lines) {
    const clean = plainInline(raw.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, ""));
    if (clean) current.push(clean);
    else flush();
  }
  flush();
  return paragraphs.join("\n");
}

/** Parses one story file of asp-source. */
export function parseAfricanStorybookStory(markdown: string): ParsedAfricanStorybookStory {
  const warnings: string[] = [];
  const lines = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

  const sections: string[][] = [[]];
  for (const line of lines) {
    if (PAGE_BREAK.test(line.trimEnd())) sections.push([]);
    else sections[sections.length - 1].push(line);
  }

  // First section: the title, and rarely a line or two that the cover shows under it.
  let title = "";
  const cover = sections[0].map((line) => line.trim()).filter(Boolean);
  if (cover.length > 0) title = plainInline(cover[0].replace(/^#+\s*/, ""));
  if (cover.length > 1) warnings.push(`text under the title was not imported: ${cover.slice(1).join(" ").slice(0, 80)}`);

  // Last section: the metadata list, when it is one.
  const result: ParsedAfricanStorybookStory = {
    title,
    pages: [],
    license: "",
    author: "",
    illustrator: "",
    translator: "",
    adaptation: "",
    language: "",
    description: "",
    warnings,
  };
  let body = sections.slice(1);
  const last = body[body.length - 1];
  if (last && last.some((line) => METADATA_LINE.test(line.trim()))) {
    body = body.slice(0, -1);
    const free: string[] = [];
    for (const raw of last) {
      const line = raw.trim();
      const field = METADATA_LINE.exec(line);
      if (!field) {
        if (line) free.push(plainInline(line));
        continue;
      }
      const value = plainInline(field[2]);
      switch (field[1].toLowerCase()) {
        case "license":
          result.license = africanStorybookLicenseName(field[2]);
          if (!result.license) warnings.push(`unknown license in the story file: ${field[2].trim().slice(0, 60)}`);
          break;
        case "text":
          result.author = value;
          break;
        case "illustration":
          result.illustrator = value;
          break;
        case "translated by":
        case "translation":
          result.translator = value;
          break;
        case "adaptation":
          result.adaptation = value;
          break;
        case "language":
          result.language = value.toLowerCase();
          break;
        default:
          warnings.push(`metadata not imported: ${line.slice(0, 80)}`);
      }
    }
    result.description = free.join(" ");
  } else {
    warnings.push("the story file has no metadata section");
  }

  result.pages = body.map(sectionText);
  if (!title) warnings.push("the story has no title");
  if (!result.author) warnings.push("the metadata names no author");
  if (!result.illustrator) warnings.push("the metadata names no illustrator");
  result.pages.forEach((text, i) => {
    if (!text) warnings.push(`page ${i + 1} has a picture but no text`);
  });
  return result;
}

export interface AfricanStorybookIndexEntry {
  /** Four-digit story number, e.g. "0010". */
  number: string;
  title: string;
  /** License with the version of the README's link, e.g. "CC BY 4.0". Empty when label and link disagree. */
  license: string;
  /** Link to the original on africanstorybook.org as the README gives it (dead since the site was rebuilt). */
  storyUrl: string;
}

/**
 * Reads the story table of a language README of asp-source:
 * "0010 | [Title](http://africanstorybook.org/stories/...) | [CC-BY](https://creativecommons.org/licenses/by/4.0/)".
 * The license is taken from the link and must agree with its label.
 */
export function parseAfricanStorybookIndex(readme: string): Map<string, AfricanStorybookIndexEntry> {
  const result = new Map<string, AfricanStorybookIndexEntry>();
  for (const raw of readme.replace(/\r\n?/g, "\n").split("\n")) {
    const row = /^(\d{4})\s*\|\s*\[(.*)\]\(([^)\s]*)\)\s*\|\s*\[([^\]]*)\]\(([^)\s]*)\)\s*$/.exec(raw.trim());
    if (!row) continue;
    const label = africanStorybookLicenseName(row[4]);
    const link = /^https?:\/\/creativecommons\.org\/licenses\/(by(?:-(?:nc|sa|nd))*)\/(\d\.\d)\/?$/i.exec(row[5]);
    const linked = link ? africanStorybookLicenseName(`CC-${link[1]}`) : "";
    result.set(row[1], {
      number: row[1],
      title: plainInline(row[2]),
      license: link && label && label === linked ? `${linked} ${link[2]}` : "",
      storyUrl: row[3],
    });
  }
  return result;
}

export interface AfricanStorybookImageIndexEntry {
  number: string;
  /** The illustrators of the story's pictures, as the image bank lists them. */
  illustrator: string;
  /** License of the pictures, without a version: "CC BY", "CC BY-NC". Empty when not recognised. */
  license: string;
}

/** Reads the illustrator table of the image bank's README: "0010 | _Title_ | **Rob Owen** | CC BY". */
export function parseAfricanStorybookImageIndex(readme: string): Map<string, AfricanStorybookImageIndexEntry> {
  const result = new Map<string, AfricanStorybookImageIndexEntry>();
  for (const raw of readme.replace(/\r\n?/g, "\n").split("\n")) {
    const row = /^(\d{4})\s*\|.*\|\s*\*\*(.*)\*\*\s*\|\s*([^|]*)$/.exec(raw.trim());
    if (!row) continue;
    result.set(row[1], { number: row[1], illustrator: row[2].trim(), license: africanStorybookLicenseName(row[3]) });
  }
  return result;
}

/** The file name a story most often has: its number and the title in lowercase with dashes. */
export function guessAfricanStorybookFile(number: string, title: string): string {
  const name = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${number}_${name || "story"}.md`;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface AfricanStorybookClientOptions {
  /** Defaults to the global fetch. Tests pass a stub, so they never touch the network. */
  fetch?: FetchLike;
  /** Optional GitHub token; raises the API rate limit (60 requests an hour without it). */
  githubToken?: string;
}

export interface AfricanStorybookCatalogueEntry {
  number: string;
  title: string;
  /** License with its version as the README states it; "" when it could not be read. */
  license: string;
  /** True when the README's license is one the importer accepts (the story file is still checked). */
  importable: boolean;
}

/** True for a license the importer may store: the CC BY family name and a version ./cc.ts knows. */
export function isImportableAfricanStorybookLicense(license: string): boolean {
  return license.startsWith(`${AFRICAN_STORYBOOK.licenseName} `) && getCcLicense(license)?.allowsAdaptation === true;
}

/**
 * Reads the two repositories. Files come from raw.githubusercontent.com (not
 * rate limited the way the API is). The API is used for one folder listing,
 * and only when a story file does not have the name its title suggests.
 */
export class AfricanStorybookClient {
  private readonly fetchImpl: FetchLike;
  private readonly token?: string;
  private indexPromise?: Promise<Map<string, AfricanStorybookIndexEntry>>;
  private imageIndexPromise?: Promise<Map<string, AfricanStorybookImageIndexEntry>>;
  private filesPromise?: Promise<Map<string, string>>;

  constructor(options: AfricanStorybookClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.token = options.githubToken?.trim() || undefined;
  }

  private async request(url: string, api: boolean) {
    const headers: Record<string, string> = { "User-Agent": "mystory-african-storybook-importer" };
    if (api) {
      headers.Accept = "application/vnd.github+json";
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
    }
    let response;
    try {
      response = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new AfricanStorybookError("network", `${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (response.status === 404) throw new AfricanStorybookError("not-found", url);
    if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
      throw new AfricanStorybookError("rate-limited", url);
    }
    if (!response.ok) throw new AfricanStorybookError("network", `${url}: HTTP ${response.status}`);
    return response;
  }

  private async text(url: string, api = false): Promise<string> {
    const response = await this.request(url, api);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_TEXT_BYTES) throw new AfricanStorybookError("invalid-book", `${url} is too large`);
    const text = await response.text();
    if (text.length > MAX_TEXT_BYTES) throw new AfricanStorybookError("invalid-book", `${url} is too large`);
    return text;
  }

  /** The story table of en/README.md: title and license of every story (fetched once per client). */
  index(): Promise<Map<string, AfricanStorybookIndexEntry>> {
    this.indexPromise ??= this.text(`${AFRICAN_STORYBOOK.sourceRawBase}/${AFRICAN_STORYBOOK.language}/README.md`).then(parseAfricanStorybookIndex);
    this.indexPromise.catch(() => {
      this.indexPromise = undefined;
    });
    return this.indexPromise;
  }

  /** The illustrator table of the image bank (fetched once per client). */
  imageIndex(): Promise<Map<string, AfricanStorybookImageIndexEntry>> {
    this.imageIndexPromise ??= this.text(`${AFRICAN_STORYBOOK.imageRawBase}/README.md`).then(parseAfricanStorybookImageIndex);
    this.imageIndexPromise.catch(() => {
      this.imageIndexPromise = undefined;
    });
    return this.imageIndexPromise;
  }

  /** Every story of the README, in story order. No API request. */
  async catalogue(): Promise<AfricanStorybookCatalogueEntry[]> {
    return [...(await this.index()).values()]
      .sort((a, b) => a.number.localeCompare(b.number))
      .map((entry) => ({
        number: entry.number,
        title: entry.title,
        license: entry.license,
        importable: isImportableAfricanStorybookLicense(entry.license),
      }));
  }

  /** Story files of the language folder by story number (one API request, made once per client). */
  files(): Promise<Map<string, string>> {
    this.filesPromise ??= this.text(`${AFRICAN_STORYBOOK.apiBase}/${AFRICAN_STORYBOOK.language}?ref=${AFRICAN_STORYBOOK.branch}`, true).then((body) => {
      let entries: unknown;
      try {
        entries = JSON.parse(body);
      } catch {
        throw new AfricanStorybookError("invalid-book", "the folder listing is not JSON");
      }
      if (!Array.isArray(entries)) throw new AfricanStorybookError("invalid-book", "the folder listing is not a list");
      const files = new Map<string, string>();
      for (const entry of entries) {
        const item = entry as { name?: unknown; type?: unknown } | null;
        if (!item || typeof item.name !== "string" || item.type !== "file") continue;
        const match = STORY_FILE.exec(item.name);
        if (match && !files.has(match[1])) files.set(match[1], item.name);
      }
      return files;
    });
    this.filesPromise.catch(() => {
      this.filesPromise = undefined;
    });
    return this.filesPromise;
  }

  private storyFile(file: string): Promise<string> {
    if (!STORY_FILE.test(file)) throw new AfricanStorybookError("invalid-id", file);
    return this.text(`${AFRICAN_STORYBOOK.sourceRawBase}/${AFRICAN_STORYBOOK.language}/${encodeURIComponent(file)}`);
  }

  /**
   * The story file of a story number. `titleHint` (the README title) is tried
   * as a file name first, which finds 350 of the 364 stories without the API.
   */
  async story(number: string, titleHint?: string): Promise<{ file: string; markdown: string }> {
    if (titleHint) {
      const file = guessAfricanStorybookFile(number, titleHint);
      if (STORY_FILE.test(file)) {
        try {
          return { file, markdown: await this.storyFile(file) };
        } catch (err) {
          if (!(err instanceof AfricanStorybookError) || err.code !== "not-found") throw err;
        }
      }
    }
    const file = (await this.files()).get(number);
    if (!file) throw new AfricanStorybookError("not-found", `no story file starts with ${number}_`);
    return { file, markdown: await this.storyFile(file) };
  }

  /**
   * Picture `index` (1 is the cover) of a story, checked to really be an
   * image. Null when the image bank has no such picture.
   */
  async image(number: string, index: number): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!/^\d{4}$/.test(number) || !Number.isInteger(index) || index < 1 || index > 99) {
      throw new AfricanStorybookError("media", `unsafe image reference ${number}/${index}`);
    }
    const url = `${AFRICAN_STORYBOOK.imageRawBase}/medium/${number}/${String(index).padStart(2, "0")}.jpg`;
    let response;
    try {
      response = await this.request(url, false);
    } catch (err) {
      if (err instanceof AfricanStorybookError && err.code === "not-found") return null;
      throw err;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMPORT_LIMITS.imageBytes) throw new AfricanStorybookError("media", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new AfricanStorybookError("media", `${url} is too large`);
    const contentType = detectImageType(bytes);
    if (!contentType || contentType === "image/svg+xml") throw new AfricanStorybookError("media", `${url} is not an image`);
    return { bytes, contentType };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface AfricanStorybookImportOptions {
  /** Story number in any form africanStorybookNumber() accepts: "10", "0010", "asp-0010". */
  id: string;
  ownerId: string;
  repo: Repository;
  media: MediaStore;
  client?: AfricanStorybookClient;
  /** Replace an existing copy (its text, translation, narration and media are deleted). Default false. */
  force?: boolean;
  /** Called before each download, for progress output. */
  onProgress?: (message: string) => void;
}

export interface AfricanStorybookImportResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
  /** Parser and download notes for a person to review. Empty for a skipped book. */
  warnings: string[];
}

/** The local copy of a story, if it was imported before. */
export async function findAfricanStorybookBook(repo: Repository, id: string): Promise<BookWithPages | null> {
  const number = africanStorybookNumber(id);
  if (!number) return null;
  return repo.getBookById(africanStorybookBookId(number));
}

function cut(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Downloads one story and creates a DRAFT in English: text = originalText =
 * the English text, language 'en', until someone translates it. Idempotent:
 * a story that was imported before is returned untouched unless `force`.
 */
export async function importAfricanStorybookBook(options: AfricanStorybookImportOptions): Promise<AfricanStorybookImportResult> {
  const { repo, media } = options;
  const number = africanStorybookNumber(options.id);
  if (!number) throw new AfricanStorybookError("invalid-id", options.id);
  const client = options.client ?? new AfricanStorybookClient();
  const say = options.onProgress ?? (() => undefined);
  const bookId = africanStorybookBookId(number);

  const existing = await repo.getBookById(bookId);
  if (existing && !options.force) return { status: "skipped", book: existing, warnings: [] };
  if (existing?.status === "published") {
    throw new AfricanStorybookError("invalid-book", `${number} is published; move it back to private before replacing it`);
  }

  // 1. License, text and metadata. Nothing is stored until everything was downloaded and checked.
  say("README.md");
  const listed = (await client.index()).get(number);
  if (!listed) throw new AfricanStorybookError("license", `${number} is not in the README, so its license version is unknown`);
  if (!listed.license) throw new AfricanStorybookError("license", `${number}: the README states no readable license`);
  // Refused before the story is downloaded: CC BY-NC, and CC BY in a version ./cc.ts cannot record (3.0).
  if (!isImportableAfricanStorybookLicense(listed.license)) throw new AfricanStorybookError("license", `${number} is ${listed.license}`);

  say("story");
  const { file, markdown } = await client.story(number, listed.title);
  const parsed = parseAfricanStorybookStory(markdown);
  const warnings = [...parsed.warnings];
  if (parsed.license !== AFRICAN_STORYBOOK.licenseName) {
    throw new AfricanStorybookError("license", `${file} says ${parsed.license || "nothing readable"}, the README says ${listed.license}`);
  }
  if (parsed.language && parsed.language !== AFRICAN_STORYBOOK.language) {
    throw new AfricanStorybookError("invalid-book", `${file} is in "${parsed.language}"`);
  }
  if (parsed.pages.length === 0) throw new AfricanStorybookError("invalid-book", `${file} has no pages`);
  if (parsed.pages.every((text) => text === "")) throw new AfricanStorybookError("no-text", file);
  if (parsed.pages.length > BOOK_LIMITS.pages) throw new AfricanStorybookError("invalid-book", `${file} has too many pages`);
  for (const text of parsed.pages) {
    if (text.length > BOOK_LIMITS.pageTextChars) throw new AfricanStorybookError("invalid-book", `${file}: a page is too long`);
  }

  say("image bank README.md");
  const pictures = (await client.imageIndex()).get(number);
  if (pictures?.license !== AFRICAN_STORYBOOK.licenseName) {
    throw new AfricanStorybookError("license", `${number}: the image bank lists the pictures as ${pictures?.license || "unknown"}`);
  }
  if (parsed.illustrator && pictures.illustrator !== parsed.illustrator) {
    warnings.push(`the image bank names other illustrators: ${pictures.illustrator}`);
  }

  // 2. Images: 01 is the cover, picture N + 1 belongs to page N, and one more may follow (the back cover).
  const files: PreparedImage[] = [];
  const keep = async (image: { bytes: Uint8Array; contentType: string }, storedBase: string): Promise<string> => {
    const path = bookMediaPath(bookId, `${storedBase}.${extensionForContentType(image.contentType)}`);
    const stored = await prepareImage(path, image.bytes, image.contentType);
    files.push(stored);
    return stored.path;
  };

  say("cover");
  const cover = await client.image(number, AFRICAN_STORYBOOK.coverImage);
  if (!cover) throw new AfricanStorybookError("no-images", `${number} has no pictures in the image bank`);
  const coverImage = await keep(cover, "cover");

  const pages: Page[] = [];
  for (const [i, text] of parsed.pages.entries()) {
    const label = `page-${String(i + 1).padStart(2, "0")}`;
    say(label);
    const image = await client.image(number, i + 2);
    if (!image) {
      throw new AfricanStorybookError("invalid-book", `${number}: ${parsed.pages.length} pages but only ${i + 1} pictures; pages and pictures cannot be matched`);
    }
    const page: Page = { index: i, text, image: await keep(image, label) };
    if (text) page.originalText = text;
    pages.push(page);
  }
  // Pages + cover + back cover is the most a story may have. A further picture means the layout is another one.
  if (await client.image(number, parsed.pages.length + 3)) {
    throw new AfricanStorybookError("invalid-book", `${number}: more pictures than ${parsed.pages.length} pages, a cover and a back cover; pages and pictures cannot be matched`);
  }

  const title = parsed.title || listed.title || file;
  const credits: BookCredits = {
    publisher: AFRICAN_STORYBOOK.publisher,
    publisherUrl: AFRICAN_STORYBOOK.publisherUrl,
    originalTitle: cut(title, 200),
    ...(parsed.translator ? { translator: cut(parsed.translator, 200) } : {}),
    // The source names who adapted the story, not what was changed.
    ...(parsed.adaptation ? { adaptation: cut(`Adaptation: ${parsed.adaptation}`, 500) } : {}),
  };
  const name = file.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = `asp-${name}`;

  // 3. Store. A replaced book loses its old files first; a failure rolls the new ones back.
  if (existing) {
    await repo.deleteBook(bookId);
    await media.deletePrefix(bookMediaPrefix(bookId));
  }
  try {
    for (const stored of files) await putImage(media, stored);
    const book = await repo.createBook({
      id: bookId,
      slug: SLUG_PATTERN.test(slug) && slug.length <= 80 ? slug : bookId,
      ownerId: options.ownerId,
      status: "draft",
      origin: "import",
      title: cut(title, 200),
      summary: cut(parsed.description, 2000),
      // Roles are named by the source ("Text", "Illustration"); a missing one stays empty.
      author: cut(parsed.author, 200),
      illustrator: cut(parsed.illustrator, 200),
      license: listed.license,
      source: africanStorybookSourceUrl(file),
      language: "en",
      originalLanguage: "en",
      credits,
      coverImage,
      readingMinutes: estimateReadingMinutes(pages.map((page) => page.text)),
      pages,
    });
    return { status: existing ? "replaced" : "created", book, warnings };
  } catch (err) {
    await media.deletePrefix(bookMediaPrefix(bookId)).catch(() => undefined);
    throw err;
  }
}
