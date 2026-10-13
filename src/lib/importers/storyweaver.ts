/**
 * StoryWeaver importer.
 *
 * StoryWeaver (https://storyweaver.org.in, by Pratham Books) publishes picture
 * books under Creative Commons licenses, most of them CC BY 4.0, in many
 * languages, Hebrew among them. The importer reads three public endpoints:
 *
 *   /api/v1/books-search?languages[]=Hebrew        the catalogue of one language
 *   /api/v1/stories/<slug>                          level, synopsis, original story
 *   /v0/stories/show-in-iframe/<slug>?iframe=true   the embeddable reader; it links to
 *   /v0/stories/<slug>/pages/<id>                   a script holding every page as HTML
 *
 * The reader's own JSON endpoint (/api/v1/stories/<slug>/read) needs a signed
 * in user and is NOT used. The embeddable reader is the one StoryWeaver offers
 * for showing a story on other sites without an account.
 *
 * Each page is an illustration and a text block; the illustrations contain no
 * text. The inner back cover carries the attribution and the license of the
 * story and of every illustration, which is where the license comes from: a
 * book whose license (or one of its illustrations' licenses) does not allow
 * adaptations is refused.
 *
 * A Hebrew story is stored as a Hebrew DRAFT, any other language as an English
 * draft waiting for translation (only English is offered besides Hebrew).
 *
 * No "server-only" import and no getRepo(): the CLI (scripts/import-storyweaver.ts)
 * runs this under tsx. All network access goes through an injectable fetch.
 */
import { estimateReadingMinutes } from "../hebrew";
import { BOOK_LIMITS } from "../limits";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { Repository } from "../repo/types";
import { SLUG_PATTERN, type AgeGroup, type BookCredits, type BookLanguage, type BookWithPages, type Page } from "../types";
import type { FetchLike } from "./bookdash";
import { getCcLicense } from "./cc";
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STORYWEAVER = {
  publisher: "StoryWeaver",
  publisherUrl: "https://storyweaver.org.in",
  base: "https://storyweaver.org.in",
  /** The only host illustrations are downloaded from. */
  imageBase: "https://storage.googleapis.com/static.storyweaver.org.in/",
  /** Languages this site can hold, by their StoryWeaver name. */
  languages: { Hebrew: "he", English: "en" } as Readonly<Record<string, BookLanguage>>,
} as const;

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const SEARCH_PAGE_SIZE = 50;
/** StoryWeaver slugs are "<numeric id>-<latin words>". */
const STORY_SLUG = /^(\d{1,12})(?:-[a-z0-9]+)*$/;

/** Stable id of the local copy of a StoryWeaver story: one copy per site, found again by slug. */
export function storyWeaverBookId(slug: string): string {
  return `storyweaver-${STORY_SLUG.exec(slug)?.[1] ?? "0"}`;
}

/** Where the imported story lives; stored in Book.source. */
export function storyWeaverSourceUrl(slug: string): string {
  return `${STORYWEAVER.base}/stories/${slug}`;
}

export type StoryWeaverErrorCode =
  | "invalid-slug"
  | "not-found"
  | "rate-limited"
  | "network"
  | "invalid-book"
  | "no-text"
  | "license"
  | "language"
  | "media";

const USER_MESSAGES: Record<StoryWeaverErrorCode, string> = {
  "invalid-slug": "שם הספר במאגר אינו תקין.",
  "not-found": "הספר לא נמצא במאגר של StoryWeaver.",
  "rate-limited": "StoryWeaver הגביל זמנית את מספר הבקשות. נסו שוב בעוד כמה דקות.",
  network: "לא הצלחנו להתחבר למאגר של StoryWeaver. בדקו את החיבור ונסו שוב.",
  "invalid-book": "הספר במאגר אינו במבנה הצפוי, ולכן לא יובא.",
  "no-text": "לספר הזה יש רק איורים, בלי טקסט, ולכן אי אפשר לייבא אותו.",
  license: "הרישיון של הספר (או של אחד האיורים) אינו מתיר עיבוד ותרגום, ולכן הוא לא יובא.",
  language: "אפשר לייבא מ-StoryWeaver רק ספרים בעברית או באנגלית.",
  media: "אחת התמונות של הספר חסרה, גדולה מדי או אינה תמונה תקינה.",
};

/** A refused or failed import. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class StoryWeaverError extends Error {
  readonly code: StoryWeaverErrorCode;
  readonly userMessage: string;

  constructor(code: StoryWeaverErrorCode, detail?: string) {
    super(detail ? `storyweaver import failed (${code}): ${detail}` : `storyweaver import failed (${code})`);
    this.name = "StoryWeaverError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

/** Text of an HTML fragment on one line: tags removed, entities decoded, soft hyphens dropped. */
function inlineText(html: string): string {
  // Inline tags sit inside words and next to punctuation ("<i>Baaa</i>!"), so they leave no space behind.
  return decodeEntities(html.replace(/<\/?(?:span|i|b|em|strong|u|a|font|sup|sub)\b[^>]*>/gi, "").replace(/<[^>]*>/g, " "))
    .replace(/­/g, "")
    .replace(/[\s ]+/g, " ")
    .trim();
}

/**
 * Translators typing Hebrew in a left-to-right editor often put the full stop
 * where it LOOKED right, which stores it before the sentence (".זהו מלך שמן").
 * A single closing mark at the start of a line that has none at its end moves
 * to the end. An ellipsis ("...ואז") is left alone.
 */
export function fixLeadingPunctuation(line: string): string {
  const match = /^([.!?,:])(?![.!?,:])\s*(.*\S)$/.exec(line);
  if (!match || /[.!?,:;…]$/.test(match[2])) return line;
  return `${match[2]}${match[1]}`;
}

/** Story text of one page: a line per paragraph or line break. */
function pageText(html: string, language: BookLanguage): string {
  const lines = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .split("\n")
    .map(inlineText)
    .filter((line) => line !== "");
  return (language === "he" ? lines.map(fixLeadingPunctuation) : lines).join("\n");
}

/**
 * The reader endpoint answers with a script: $('#storyReader').html("...");
 * Returns the HTML inside that string literal.
 */
export function extractReaderHtml(script: string): string {
  const marker = '.html("';
  const start = script.indexOf(marker);
  if (start < 0) throw new StoryWeaverError("invalid-book", "the reader script holds no page markup");
  let out = "";
  for (let i = start + marker.length; i < script.length; i++) {
    const char = script[i];
    if (char === '"') return out;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = script[++i];
    out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "" : (next ?? "");
  }
  throw new StoryWeaverError("invalid-book", "the reader script is cut off");
}

export interface StoryWeaverPage {
  /** Full URL of the illustration. Undefined for a page without a picture. */
  imageUrl?: string;
  text: string;
}

export interface ParsedStoryWeaverBook {
  title: string;
  coverImageUrl?: string;
  /** People named on the front cover, by the label StoryWeaver printed, e.g. "Author", "Translator". */
  contributors: Record<string, string>;
  pages: StoryWeaverPage[];
  /** License of the story text, as written on the back cover, e.g. "CC BY 4.0". Empty when not found. */
  license: string;
  /** Distinct licenses of the illustrations. */
  illustrationLicenses: string[];
  /** "This story: ... is translated by ... Released under CC BY 4.0 license." and the original story's line. */
  attribution: string;
  synopsis: string;
  warnings: string[];
}

function illustrationUrl(pageHtml: string): string | undefined {
  const img = /<img\b[^>]*class=['"][^'"]*responsive_illustration[^'"]*['"][^>]*>/i.exec(pageHtml)?.[0];
  if (!img) return undefined;
  const url = /data-size7-src=['"]([^'"]+)['"]/i.exec(img)?.[1] ?? /\ssrc=['"]([^'"]+)['"]/i.exec(img)?.[1];
  return url && url.startsWith(STORYWEAVER.imageBase) ? url : undefined;
}

/** "Released under CC BY 4.0 license" → "CC BY 4.0"; StoryWeaver writes CC0 and public domain without a version. */
function normalizeLicense(raw: string): string {
  const text = raw.replace(/­/g, "").replace(/\s+/g, " ").trim();
  if (/^(CC0|public domain)/i.test(text)) return "CC0 1.0";
  return text.replace(/^CC[- ]BY/i, "CC BY").replace(/\s+license$/i, "");
}

function licensesIn(html: string): string[] {
  const found = new Set<string>();
  for (const match of inlineText(html).matchAll(/Released under (?:the |a )?(.{2,40}?) licen[sc]e/gi)) {
    found.add(normalizeLicense(match[1]));
  }
  return [...found];
}

function classBlock(html: string, className: string): string {
  const open = new RegExp(`<(span|p|div)\\b[^>]*class=['"][^'"]*\\b${className}\\b[^'"]*['"][^>]*>`, "i").exec(html);
  if (!open) return "";
  const rest = html.slice(open.index + open[0].length);
  // These blocks hold only inline children of other tag names, so the first closing tag of the same name ends them.
  const end = rest.search(new RegExp(`</${open[1]}\\s*>\\s*(?=<(?:span class="(?:original-story|illustration)-attribution|p class=|/div))`, "i"));
  return end < 0 ? rest : rest.slice(0, end);
}

/** Parses the reader markup of one story (see extractReaderHtml). */
export function parseStoryWeaverReader(html: string, language: BookLanguage): ParsedStoryWeaverBook {
  const warnings: string[] = [];
  const chunks = html.split(/<div\b[^>]*class=['"][^'"]*\bstory-page\b[^'"]*['"][^>]*>/i).slice(1);
  if (chunks.length === 0) throw new StoryWeaverError("invalid-book", "the reader holds no pages");

  let title = "";
  let coverImageUrl: string | undefined;
  let synopsis = "";
  let license = "";
  let attribution = "";
  const contributors: Record<string, string> = {};
  const illustrationLicenses = new Set<string>();
  const pages: StoryWeaverPage[] = [];

  for (const chunk of chunks) {
    if (/\bfront-cover-page\b/.test(chunk)) {
      title = inlineText(/<p\b[^>]*class=['"][^'"]*\bcover_title\b[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i.exec(chunk)?.[1] ?? "");
      coverImageUrl = illustrationUrl(chunk);
      for (const match of chunk.matchAll(/<p\b[^>]*class=['"][^'"]*\bcover_attribution\b[^'"]*['"][^>]*>([\s\S]*?)<\/p>/gi)) {
        const line = /^([^:]{2,40}):\s*(.+)$/.exec(inlineText(match[1]));
        if (line) contributors[line[1].trim()] = line[2].replace(/\s+,/g, ",").trim();
      }
      continue;
    }
    if (/\battribution-text\b/.test(chunk)) {
      // A long book spreads its attributions over several pages; only the first names the story.
      const self = classBlock(chunk, "self-attribution");
      const original = classBlock(chunk, "original-story-attribution");
      license ||= licensesIn(self)[0] ?? licensesIn(original)[0] ?? "";
      attribution ||= [inlineText(self), inlineText(original)]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+([.,])/g, "$1");
      const pictures = chunk;
      for (const match of pictures.matchAll(/<span class="illustration-attribution">([\s\S]*?)<\/span>\s*(?=<span class="illustration-attribution">|<\/div>)/gi)) {
        for (const found of licensesIn(match[1])) illustrationLicenses.add(found);
      }
      continue;
    }
    if (/\bback-cover-top\b/.test(chunk)) {
      synopsis = inlineText(/<p\b[^>]*class=['"][^'"]*\bsynopsis\b[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i.exec(chunk)?.[1] ?? "");
      continue;
    }
    // A story page: an optional illustration and its text. Older stories keep the text in one block
    // before the page number; newer ones leave that block empty and place the text in a second,
    // positioned block after it. Every text block of the page is read.
    const blocks = chunk
      .split(/<div\b[^>]*class=['"][^'"]*\bcontent\b[^'"]*['"][^>]*>/i)
      .slice(1)
      .map((block) => block.split(/<div class="page_number|<div id="lastSPage|<svg\b|<script\b/i)[0]);
    const text = blocks
      .map((block) => pageText(block, language))
      .filter(Boolean)
      .join("\n");
    const imageUrl = illustrationUrl(chunk);
    if (imageUrl || text) pages.push({ ...(imageUrl ? { imageUrl } : {}), text });
  }

  if (!title) warnings.push("the story has no title on its cover");
  if (!license) warnings.push("the back cover names no license");
  pages.forEach((page, i) => {
    if (page.imageUrl && !page.text) warnings.push(`page ${i + 1} has a picture but no text`);
    if (!page.imageUrl && page.text) warnings.push(`page ${i + 1} has text but no picture`);
  });
  return {
    title,
    ...(coverImageUrl ? { coverImageUrl } : {}),
    contributors,
    pages,
    license,
    illustrationLicenses: [...illustrationLicenses],
    attribution,
    synopsis,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface StoryWeaverCatalogueEntry {
  slug: string;
  title: string;
  description: string;
  language: string;
  level: string;
}

export interface StoryWeaverDetails {
  title: string;
  description: string;
  language: string;
  level: string;
  /** Title of the story this one translates or re-levels, when there is one. */
  originalTitle?: string;
  originalPublisher?: string;
}

function names(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => (typeof item === "string" ? item : typeof (item as { name?: unknown })?.name === "string" ? (item as { name: string }).name : ""))
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export interface StoryWeaverClientOptions {
  /** Defaults to the global fetch. Tests pass a stub, so they never touch the network. */
  fetch?: FetchLike;
}

export class StoryWeaverClient {
  private readonly fetchImpl: FetchLike;

  constructor(options: StoryWeaverClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
  }

  private async request(url: string, headers: Record<string, string> = {}) {
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { "User-Agent": "mystory-storyweaver-importer", ...headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new StoryWeaverError("network", `${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (response.status === 404) throw new StoryWeaverError("not-found", url);
    if (response.status === 429) throw new StoryWeaverError("rate-limited", url);
    if (!response.ok) throw new StoryWeaverError("network", `${url}: HTTP ${response.status}`);
    return response;
  }

  private async text(url: string, headers?: Record<string, string>): Promise<string> {
    const response = await this.request(url, headers);
    const body = await response.text();
    if (body.length > MAX_TEXT_BYTES) throw new StoryWeaverError("invalid-book", `${url} is too large`);
    return body;
  }

  private async json(url: string): Promise<Record<string, unknown>> {
    const body = await this.text(url, { Accept: "application/json" });
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // falls through
    }
    throw new StoryWeaverError("invalid-book", `${url} did not answer with JSON`);
  }

  /** Every story of one language (a StoryWeaver language name such as "Hebrew"), in catalogue order. */
  async catalogue(language: string, limit = Infinity): Promise<StoryWeaverCatalogueEntry[]> {
    const entries: StoryWeaverCatalogueEntry[] = [];
    for (let page = 1; entries.length < limit; page++) {
      const url = `${STORYWEAVER.base}/api/v1/books-search?languages[]=${encodeURIComponent(language)}&page=${page}&per_page=${SEARCH_PAGE_SIZE}`;
      const body = await this.json(url);
      const data = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      for (const item of data) {
        const slug = text(item?.slug);
        if (!STORY_SLUG.test(slug) || text(item.language) !== language) continue;
        entries.push({ slug, title: text(item.title) || slug, description: text(item.description), language, level: text(item.level) });
      }
      const totalPages = Number((body.metadata as { totalPages?: unknown } | undefined)?.totalPages);
      if (data.length === 0 || !Number.isFinite(totalPages) || page >= totalPages) break;
    }
    return entries.slice(0, limit);
  }

  async details(slug: string): Promise<StoryWeaverDetails> {
    const body = await this.json(`${STORYWEAVER.base}/api/v1/stories/${slug}`);
    const data = (body.data ?? {}) as Record<string, unknown>;
    const original = (data.originalStory ?? null) as Record<string, unknown> | null;
    const originalTitle = text(original?.name);
    const originalPublisher = text((original?.originalPublisher as { name?: unknown } | undefined)?.name) || text((data.publisher as { name?: unknown } | undefined)?.name);
    return {
      title: text(data.name),
      description: text(data.description),
      language: text(data.language),
      level: text(data.level),
      ...(originalTitle ? { originalTitle } : {}),
      ...(originalPublisher ? { originalPublisher } : {}),
    };
  }

  /** The reader markup of a story: every page, the covers and the attribution page. */
  async readerHtml(slug: string): Promise<string> {
    const frame = await this.text(`${STORYWEAVER.base}/v0/stories/show-in-iframe/${slug}?iframe=true`);
    const link = new RegExp(`href="(?:/[a-z]{2,3})?/v0/stories/${slug}/pages/(\\d+)"`).exec(frame);
    if (!link) throw new StoryWeaverError("invalid-book", `${slug}: the embeddable reader links to no page`);
    const script = await this.text(`${STORYWEAVER.base}/v0/stories/${slug}/pages/${link[1]}`, {
      Accept: "text/javascript",
      "X-Requested-With": "XMLHttpRequest",
    });
    return extractReaderHtml(script);
  }

  /** One illustration, checked to come from StoryWeaver's storage and to really be an image. */
  async image(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!url.startsWith(STORYWEAVER.imageBase) || /[\s"'<>\\]|\.\./.test(url)) throw new StoryWeaverError("media", `unsafe image url ${url}`);
    let response;
    try {
      response = await this.request(url);
    } catch (err) {
      if (err instanceof StoryWeaverError && err.code === "not-found") throw new StoryWeaverError("media", `${url} is missing`);
      throw err;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMPORT_LIMITS.imageBytes) throw new StoryWeaverError("media", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new StoryWeaverError("media", `${url} is too large`);
    const contentType = detectImageType(bytes);
    if (!contentType || contentType === "image/svg+xml") throw new StoryWeaverError("media", `${url} is not an image`);
    return { bytes, contentType };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface StoryWeaverImportOptions {
  slug: string;
  ownerId: string;
  repo: Repository;
  media: MediaStore;
  client?: StoryWeaverClient;
  /** Replace an existing copy (its text, translation, narration and media are deleted). Default false. */
  force?: boolean;
  /** Called before each download, for progress output. */
  onProgress?: (message: string) => void;
}

export interface StoryWeaverImportResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
  /** Parser and download notes for a person to review. Empty for a skipped book. */
  warnings: string[];
}

/** The local copy of a StoryWeaver story, if it was imported before. */
export async function findStoryWeaverBook(repo: Repository, slug: string): Promise<BookWithPages | null> {
  if (!STORY_SLUG.test(slug)) return null;
  return repo.getBookById(storyWeaverBookId(slug));
}

/** StoryWeaver reading levels 1-4 (first words to fluent readers) mapped to this site's age groups. */
function ageGroupForLevel(level: string): AgeGroup {
  return level === "3" || level === "4" ? "6-8" : "3-5";
}

function cut(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Downloads one story and creates a DRAFT. Idempotent: a story that was
 * imported before is returned untouched unless `force`.
 */
export async function importStoryWeaverBook(options: StoryWeaverImportOptions): Promise<StoryWeaverImportResult> {
  const { slug, repo, media } = options;
  if (!STORY_SLUG.test(slug) || slug.length > 200) throw new StoryWeaverError("invalid-slug", slug);
  const client = options.client ?? new StoryWeaverClient();
  const say = options.onProgress ?? (() => undefined);
  const bookId = storyWeaverBookId(slug);

  const existing = await repo.getBookById(bookId);
  if (existing && !options.force) return { status: "skipped", book: existing, warnings: [] };
  if (existing?.status === "published") {
    throw new StoryWeaverError("invalid-book", `${slug} is published; move it back to private before replacing it`);
  }

  // 1. Text and metadata. Nothing is stored until everything was downloaded and checked.
  say("details");
  const details = await client.details(slug);
  const language = STORYWEAVER.languages[details.language];
  if (!language) throw new StoryWeaverError("language", `${slug} is in ${details.language || "an unknown language"}`);
  say("reader");
  const parsed = parseStoryWeaverReader(await client.readerHtml(slug), language);
  const warnings = [...parsed.warnings];

  const licenses = [parsed.license, ...parsed.illustrationLicenses];
  if (!parsed.license) throw new StoryWeaverError("license", `${slug} names no license`);
  for (const license of licenses) {
    if (!getCcLicense(license)?.allowsAdaptation) throw new StoryWeaverError("license", `${slug}: ${license}`);
  }
  const otherLicenses = parsed.illustrationLicenses.filter((license) => license !== parsed.license);
  if (otherLicenses.length > 0) warnings.push(`illustrations are under ${otherLicenses.join(", ")} (the story is ${parsed.license})`);

  if (parsed.pages.length === 0) throw new StoryWeaverError("invalid-book", `${slug} has no pages`);
  if (parsed.pages.every((page) => page.text === "")) throw new StoryWeaverError("no-text", slug);
  if (parsed.pages.length > BOOK_LIMITS.pages) throw new StoryWeaverError("invalid-book", `${slug} has too many pages`);
  for (const page of parsed.pages) {
    if (page.text.length > BOOK_LIMITS.pageTextChars) throw new StoryWeaverError("invalid-book", `${slug}: a page is too long`);
  }

  // 2. Images. The same illustration may serve several pages; it is stored once.
  const files = new Map<string, { path: string; bytes: Uint8Array; contentType: string }>();
  const download = async (url: string, storedBase: string): Promise<string> => {
    const known = files.get(url);
    if (known) return known.path;
    say(storedBase);
    const image = await client.image(url);
    const path = bookMediaPath(bookId, `${storedBase}.${extensionForContentType(image.contentType)}`);
    files.set(url, { path, ...image });
    return path;
  };

  const pages: Page[] = [];
  for (const [i, source] of parsed.pages.entries()) {
    const page: Page = { index: i, text: source.text };
    if (source.imageUrl) page.image = await download(source.imageUrl, `page-${String(i + 1).padStart(2, "0")}`);
    pages.push(page);
  }
  let coverImage = pages.find((page) => page.image)?.image ?? "";
  if (parsed.coverImageUrl) {
    try {
      coverImage = await download(parsed.coverImageUrl, "cover");
    } catch (err) {
      if (!(err instanceof StoryWeaverError) || err.code !== "media") throw err;
      warnings.push(`the cover could not be downloaded: ${err.message}`);
    }
  }

  const people = parsed.contributors;
  const author = people.Author ?? people.Authors ?? "";
  const illustrator = people.Illustrator ?? people.Illustrators ?? people.Photographer ?? people.Photographers ?? "";
  const translator = people.Translator ?? people.Translators ?? "";
  const knownLabels = new Set(["Author", "Authors", "Illustrator", "Illustrators", "Photographer", "Photographers", "Translator", "Translators", "Original Publisher", "Publisher"]);
  const others = Object.entries(people)
    .filter(([label]) => !knownLabels.has(label))
    .map(([label, value]) => `${label}: ${value}`);
  if (!author) warnings.push("the cover names no author");
  if (!illustrator) warnings.push("the cover names no illustrator");

  const title = parsed.title || details.title || slug;
  const originalTitle = details.originalTitle && details.originalTitle !== title ? details.originalTitle : undefined;
  const credits: BookCredits = {
    publisher: cut(people["Original Publisher"] ?? people.Publisher ?? details.originalPublisher ?? STORYWEAVER.publisher, 200),
    publisherUrl: STORYWEAVER.publisherUrl,
    ...(parsed.attribution ? { attributionLine: cut(parsed.attribution, 500) } : {}),
    ...(originalTitle ? { originalTitle: cut(originalTitle, 200) } : {}),
    ...(translator ? { translator: cut(translator, 200) } : {}),
    ...(others.length > 0 ? { adaptation: cut(others.join("; "), 500) } : {}),
  };

  // 3. Store. A replaced book loses its old files first; a failure rolls the new ones back.
  if (existing) {
    await repo.deleteBook(bookId);
    await media.deletePrefix(bookMediaPrefix(bookId));
  }
  try {
    for (const file of files.values()) await media.put(file.path, file.bytes, file.contentType);
    const book = await repo.createBook({
      id: bookId,
      slug: SLUG_PATTERN.test(slug) && slug.length <= 68 ? `storyweaver-${slug}` : bookId,
      ownerId: options.ownerId,
      status: "draft",
      origin: "import",
      title: cut(title, 200),
      summary: cut(parsed.synopsis || details.description, 2000),
      author: cut(author, 200),
      illustrator: cut(illustrator, 200),
      license: parsed.license,
      source: storyWeaverSourceUrl(slug),
      ageGroup: ageGroupForLevel(details.level),
      // A story in English waits for translation; a Hebrew one is a finished translation or an original.
      ...(language === "he" ? {} : { language, originalLanguage: language }),
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
