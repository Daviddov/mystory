/**
 * Book Dash importer.
 *
 * Book Dash (https://bookdash.org) publishes its picture books under CC BY 4.0
 * and keeps web versions in the GitHub repository bookdash/bookdash-books
 * (branch gh-pages):
 *
 *   <slug>/<lang>/index.md            YAML header, "# Title", then per page an image
 *                                     line "![description](.../01.jpg)" and its text
 *   <slug>/<lang>/images/             cover.jpg, 01.jpg, 02.jpg ..., book-dash-logo.png
 *   _data/meta.yml                    title, description and "creator" per book
 *
 * The illustrations contain no text, so a translation only replaces the text.
 *
 * Credits: the repository names the people behind a book only as one list
 * ("creator: A, B, C", rendered by Book Dash as "Created by A, B, C"), without
 * saying who wrote, illustrated, designed or edited. The importer stores that
 * list in credits.creators and leaves the role fields EMPTY: it never guesses
 * roles from the order of the names. missingCreditRoles() in ../credits.ts
 * reports what is still missing.
 *
 * No "server-only" import and no getRepo(): the CLI (scripts/import-bookdash.ts)
 * runs this under tsx. All network access goes through an injectable fetch.
 */
import { estimateReadingMinutes } from "../hebrew";
import { BOOK_LIMITS } from "../limits";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { Repository } from "../repo/types";
import { SLUG_PATTERN, type BookCredits, type BookWithPages, type Page } from "../types";
import { fetchBookDashWebImage, fetchBookDashWebPage, type BookDashWebPage, type WebFetch } from "./bookdash-web";
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BOOKDASH = {
  publisher: "Book Dash",
  publisherUrl: "https://bookdash.org",
  license: "CC BY 4.0",
  /** The line Book Dash asks re-users to show. */
  attributionLine: "Originally published by Book Dash under a Creative Commons CC BY 4.0 license.",
  repo: "bookdash/bookdash-books",
  branch: "gh-pages",
  rawBase: "https://raw.githubusercontent.com/bookdash/bookdash-books/gh-pages",
  apiBase: "https://api.github.com/repos/bookdash/bookdash-books/contents",
  logoFile: "book-dash-logo.png",
  coverFile: "cover.jpg",
} as const;

/** Top-level folders of the repository that are not books. */
const NON_BOOK_DIRS = new Set(["admin", "css", "download", "images", "js", "fonts"]);

/** Longest markdown or metadata file accepted. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

/** Stable id of the local copy of a Book Dash book: one copy per site, found again by slug. */
export function bookDashBookId(slug: string): string {
  return `bookdash-${slug}`.slice(0, 64);
}

/** Where the imported edition lives; stored in Book.source. */
export function bookDashSourceUrl(slug: string, lang = "en"): string {
  return `https://github.com/${BOOKDASH.repo}/tree/${BOOKDASH.branch}/${slug}/${lang}`;
}

export type BookDashErrorCode =
  "invalid-slug" | "not-found" | "rate-limited" | "network" | "invalid-book" | "no-text" | "media";

const USER_MESSAGES: Record<BookDashErrorCode, string> = {
  "invalid-slug": "שם הספר במאגר אינו תקין.",
  "not-found": "הספר לא נמצא במאגר של Book Dash (או שאין לו מהדורה באנגלית).",
  "rate-limited": "GitHub הגביל זמנית את מספר הבקשות. נסו שוב בעוד כמה דקות, או הגדירו GITHUB_TOKEN.",
  network: "לא הצלחנו להתחבר למאגר של Book Dash. בדקו את החיבור ונסו שוב.",
  "invalid-book": "קובץ הספר במאגר אינו במבנה הצפוי, ולכן לא יובא.",
  "no-text": "במאגר של Book Dash יש לספר הזה רק איורים, בלי טקסט, ולכן אי אפשר לייבא אותו עדיין.",
  media: "אחת התמונות של הספר חסרה, גדולה מדי או אינה תמונה תקינה.",
};

/** A refused or failed import. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class BookDashError extends Error {
  readonly code: BookDashErrorCode;
  readonly userMessage: string;

  constructor(code: BookDashErrorCode, detail?: string) {
    super(detail ? `book dash import failed (${code}): ${detail}` : `book dash import failed (${code})`);
    this.name = "BookDashError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

export interface BookDashPage {
  /** File name inside the book's images folder, e.g. "01.jpg". Undefined for text without a picture. */
  imageFile?: string;
  /** The description Book Dash wrote for the illustration. */
  imageAlt?: string;
  /** Story text of the page; paragraphs are separated by a newline. */
  text: string;
}

export interface ParsedBookDashBook {
  /** From the YAML header, falling back to the first heading. Empty when neither exists. */
  title: string;
  pages: BookDashPage[];
  /** Things a person should look at (never fatal). */
  warnings: string[];
}

// The target may contain spaces: Book Dash writes "{{ site.image-set }}/01.jpg".
const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*([^)"]+?)\s*(?:"[^"]*"\s*)?\)\s*(?:\{:[^}]*\})?\s*$/;
const KRAMDOWN_ATTRIBUTE_LINE = /^\{:[^}]*\}\s*$/;
const SAFE_IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.(?:jpe?g|png|gif|webp)$/i;

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(trimmed) ?? /^'((?:[^']|'')*)'/.exec(trimmed);
  if (quoted)
    return quoted[1]
      .replace(/\\(["\\])/g, "$1")
      .replace(/''/g, "'")
      .trim();
  // Unquoted scalar: a " #" starts a comment.
  return trimmed.replace(/\s+#.*$/, "").trim();
}

/** Removes inline markdown that would otherwise be read aloud: emphasis markers, links, escapes. */
function plainInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(?<![\w*])([*_])(?=\S)(.+?)(?<=\S)\1(?![\w*])/g, "$2")
    .replace(/\\([*_#[\]()!`\\])/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\{:[^}]*\}/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .trim();
}

function paragraphsToText(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(" "));
    current = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (KRAMDOWN_ATTRIBUTE_LINE.test(line.trim())) continue;
    const hardBreak = / {2,}$/.test(raw) || /\\$/.test(line);
    const clean = plainInline(
      line
        .replace(/\\$/, "")
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, ""),
    );
    if (clean) current.push(clean);
    if (hardBreak) flush();
  }
  flush();
  return paragraphs.join("\n");
}

/**
 * Parses one Book Dash index.md. Text before the first image becomes a page
 * without a picture; an image with no text becomes a page without text.
 */
export function parseBookDashMarkdown(markdown: string): ParsedBookDashBook {
  const warnings: string[] = [];
  const lines = markdown
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  let cursor = 0;
  let title = "";
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const match = /^title:\s*(.*)$/.exec(line);
        if (match) title = unquote(match[1]);
      }
      cursor = end + 1;
    } else {
      warnings.push("the YAML header is not closed");
    }
  }

  const pages: BookDashPage[] = [];
  let current: {
    imageFile?: string;
    imageAlt?: string;
    lines: string[];
  } | null = null;
  let headingSeen = false;
  const close = () => {
    if (!current) return;
    const text = paragraphsToText(current.lines);
    if (current.imageFile || text) {
      pages.push({
        ...(current.imageFile ? { imageFile: current.imageFile } : {}),
        ...(current.imageAlt ? { imageAlt: current.imageAlt } : {}),
        text,
      });
    }
    current = null;
  };

  for (const line of lines.slice(cursor)) {
    const trimmed = line.trim();
    if (!headingSeen && pages.length === 0 && !current && /^#\s+/.test(trimmed)) {
      headingSeen = true;
      if (!title) title = plainInline(trimmed.replace(/^#\s+/, ""));
      continue;
    }
    const image = IMAGE_LINE.exec(trimmed);
    if (image) {
      close();
      const file = image[2].split(/[\\/]/).pop() ?? "";
      const alt = plainInline(image[1]);
      if (SAFE_IMAGE_FILE.test(file)) {
        current = { imageFile: file, imageAlt: alt || undefined, lines: [] };
      } else {
        warnings.push(`image reference skipped: ${image[2].slice(0, 80)}`);
        current = { imageAlt: alt || undefined, lines: [] };
      }
      continue;
    }
    if (!current) {
      if (trimmed === "" || KRAMDOWN_ATTRIBUTE_LINE.test(trimmed)) continue;
      current = { lines: [] };
    }
    current.lines.push(line);
  }
  close();

  if (!title) warnings.push("the book has no title");
  pages.forEach((page, i) => {
    if (page.imageFile && !page.text) warnings.push(`page ${i + 1} has a picture but no text`);
    if (!page.imageFile && page.text) warnings.push(`page ${i + 1} has text but no picture`);
    if (page.imageFile && !page.imageAlt) warnings.push(`page ${i + 1} has no image description`);
  });
  return { title, pages, warnings };
}

export interface BookDashMeta {
  title: string;
  subtitle: string;
  /** The undifferentiated list of people behind the book, exactly as Book Dash wrote it. */
  creator: string;
  description: string;
  /** Publication date (YYYY-MM-DD) when given. */
  date: string;
}

/**
 * Reads the `titles:` map of _data/meta.yml. This is not a YAML parser: it
 * understands exactly the layout of that file (two-space slug keys, four-space
 * `key: "value"  # comment` lines) and ignores everything deeper (translations).
 */
export function parseBookDashMeta(yaml: string): Map<string, BookDashMeta> {
  const result = new Map<string, BookDashMeta>();
  let inTitles = false;
  let current: BookDashMeta | null = null;
  for (const raw of yaml.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\S/.test(raw)) {
      inTitles = /^titles:\s*(#.*)?$/.test(raw);
      current = null;
      continue;
    }
    if (!inTitles) continue;
    const slug = /^ {2}([a-z0-9]+(?:-[a-z0-9]+)*):\s*(#.*)?$/.exec(raw);
    if (slug) {
      current = {
        title: "",
        subtitle: "",
        creator: "",
        description: "",
        date: "",
      };
      result.set(slug[1], current);
      continue;
    }
    const field = /^ {4}(title|subtitle|creator|description|date):\s*(.*)$/.exec(raw);
    if (field && current) current[field[1] as keyof BookDashMeta] = unquote(field[2]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface BookDashClientOptions {
  /** Defaults to the global fetch. Tests pass a stub, so they never touch the network. */
  fetch?: FetchLike;
  /** Optional GitHub token; raises the API rate limit (60 requests an hour without it). */
  githubToken?: string;
}

export interface BookDashCatalogueEntry {
  slug: string;
  title: string;
  description: string;
  creators: string;
}

export interface BookDashCatalogue {
  entries: BookDashCatalogueEntry[];
  /** False when the folder listing could not be read and only books named in meta.yml are listed. */
  complete: boolean;
}

/**
 * Reads the Book Dash repository. Files come from raw.githubusercontent.com
 * (not rate limited the way the API is); the API is used only for the one
 * folder listing of the catalogue.
 */
export class BookDashClient {
  private readonly fetchImpl: FetchLike;
  private readonly token?: string;
  private metaPromise?: Promise<Map<string, BookDashMeta>>;

  constructor(options: BookDashClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.token = options.githubToken?.trim() || undefined;
  }

  private async request(url: string, api: boolean) {
    const headers: Record<string, string> = {
      "User-Agent": "mystory-bookdash-importer",
    };
    if (api) {
      headers.Accept = "application/vnd.github+json";
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
    }
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new BookDashError("network", `${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (response.status === 404) throw new BookDashError("not-found", url);
    if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
      throw new BookDashError("rate-limited", url);
    }
    if (!response.ok) throw new BookDashError("network", `${url}: HTTP ${response.status}`);
    return response;
  }

  private async text(url: string, api = false): Promise<string> {
    const response = await this.request(url, api);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_TEXT_BYTES)
      throw new BookDashError("invalid-book", `${url} is too large`);
    const text = await response.text();
    if (text.length > MAX_TEXT_BYTES) throw new BookDashError("invalid-book", `${url} is too large`);
    return text;
  }

  /** Metadata of every book named in _data/meta.yml (fetched once per client). */
  meta(): Promise<Map<string, BookDashMeta>> {
    this.metaPromise ??= this.text(`${BOOKDASH.rawBase}/_data/meta.yml`).then(parseBookDashMeta);
    this.metaPromise.catch(() => {
      this.metaPromise = undefined;
    });
    return this.metaPromise;
  }

  /** Book folders of the repository (one API request). */
  async listSlugs(): Promise<string[]> {
    const body = await this.text(`${BOOKDASH.apiBase}/?ref=${BOOKDASH.branch}`, true);
    let entries: unknown;
    try {
      entries = JSON.parse(body);
    } catch {
      throw new BookDashError("invalid-book", "the folder listing is not JSON");
    }
    if (!Array.isArray(entries)) throw new BookDashError("invalid-book", "the folder listing is not a list");
    return entries
      .filter((entry): entry is { name: string; type: string } => {
        const item = entry as { name?: unknown; type?: unknown } | null;
        return !!item && typeof item.name === "string" && item.type === "dir";
      })
      .map((entry) => entry.name)
      .filter((name) => SLUG_PATTERN.test(name) && !NON_BOOK_DIRS.has(name))
      .sort();
  }

  /** Every book with its title, blurb and creators. Falls back to meta.yml alone when the listing fails. */
  async catalogue(): Promise<BookDashCatalogue> {
    const meta = await this.meta();
    let slugs: string[];
    let complete = true;
    try {
      slugs = await this.listSlugs();
    } catch (err) {
      if (!(err instanceof BookDashError) || err.code === "invalid-book") throw err;
      slugs = [...meta.keys()].sort();
      complete = false;
    }
    return {
      complete,
      entries: slugs.map((slug) => {
        const info = meta.get(slug);
        return {
          slug,
          title: info?.title || slug,
          description: info?.description ?? "",
          creators: info?.creator ?? "",
        };
      }),
    };
  }

  markdown(slug: string, lang = "en"): Promise<string> {
    return this.text(`${BOOKDASH.rawBase}/${slug}/${lang}/index.md`);
  }

  /** One file of the book's images folder, checked to really be an image. */
  async image(slug: string, file: string, lang = "en"): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!SAFE_IMAGE_FILE.test(file)) throw new BookDashError("media", `unsafe image name ${file}`);
    const url = `${BOOKDASH.rawBase}/${slug}/${lang}/images/${file}`;
    let response;
    try {
      response = await this.request(url, false);
    } catch (err) {
      if (err instanceof BookDashError && err.code === "not-found")
        throw new BookDashError("media", `${url} is missing`);
      throw err;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMPORT_LIMITS.imageBytes)
      throw new BookDashError("media", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new BookDashError("media", `${url} is too large`);
    const contentType = detectImageType(bytes);
    if (!contentType || contentType === "image/svg+xml") throw new BookDashError("media", `${url} is not an image`);
    return { bytes, contentType };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface BookDashImportOptions {
  slug: string;
  ownerId: string;
  repo: Repository;
  media: MediaStore;
  client?: BookDashClient;
  /** Replace an existing copy (its text, translation, narration and media are deleted). Default false. */
  force?: boolean;
  /** Called before each download, for progress output. */
  onProgress?: (message: string) => void;
  /**
   * Fill what the repository lacks from the book's page on bookdash.org: page pictures
   * (with the English text printed in them), the cover and the credits. Also lets a book
   * without any text in the repository through. Default false.
   */
  web?: boolean;
  /** Replaces fetch for the bookdash.org requests (tests). */
  webFetch?: WebFetch;
}

export interface BookDashImportResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
  /** Parser and download notes for a person to review. Empty for a skipped book. */
  warnings: string[];
}

/** The local copy of a Book Dash book, if it was imported before. */
export async function findBookDashBook(repo: Repository, slug: string): Promise<BookWithPages | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  return repo.getBookById(bookDashBookId(slug));
}

/**
 * Downloads one book and creates a DRAFT in English: text = originalText =
 * the English text, language 'en', until someone translates it. Idempotent:
 * a book that was imported before is returned untouched unless `force`.
 */
export async function importBookDashBook(options: BookDashImportOptions): Promise<BookDashImportResult> {
  const { slug, repo, media } = options;
  if (!SLUG_PATTERN.test(slug) || slug.length > 54 || NON_BOOK_DIRS.has(slug))
    throw new BookDashError("invalid-slug", slug);
  const client = options.client ?? new BookDashClient();
  const say = options.onProgress ?? (() => undefined);
  const bookId = bookDashBookId(slug);

  const existing = await repo.getBookById(bookId);
  if (existing && !options.force) return { status: "skipped", book: existing, warnings: [] };
  if (existing?.status === "published") {
    throw new BookDashError("invalid-book", `${slug} is published; move it back to private before replacing it`);
  }

  // 1. Text and metadata. Nothing is stored until everything was downloaded and checked.
  say("index.md");
  const parsed = parseBookDashMarkdown(await client.markdown(slug));
  const warnings = [...parsed.warnings];
  if (parsed.pages.length === 0) throw new BookDashError("invalid-book", `${slug} has no pages`);
  // A few books in the repository are unfinished: twelve pictures and not a word of the story.
  const textless = parsed.pages.every((page) => page.text === "");
  if (textless && !options.web) throw new BookDashError("no-text", slug);
  if (parsed.pages.length > BOOK_LIMITS.pages) throw new BookDashError("invalid-book", `${slug} has too many pages`);
  for (const page of parsed.pages) {
    if (page.text.length > BOOK_LIMITS.pageTextChars)
      throw new BookDashError("invalid-book", `${slug}: a page is too long`);
  }

  let meta: BookDashMeta | undefined;
  try {
    meta = (await client.meta()).get(slug);
  } catch (err) {
    warnings.push(`the metadata file could not be read: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!meta) warnings.push("the book is not listed in _data/meta.yml: no description and no creators");
  else if (!meta.creator) warnings.push("the metadata names no creators");
  // Unfinished books still carry the template's placeholder title.
  const title = (parsed.title === "Title" ? "" : parsed.title) || meta?.title || slug;

  let web: BookDashWebPage | undefined;
  if (options.web) {
    say("bookdash.org");
    try {
      web = await fetchBookDashWebPage(slug, parsed.pages.length, options.webFetch);
    } catch (err) {
      if (textless) throw new BookDashError("no-text", `${slug}: ${err instanceof Error ? err.message : String(err)}`);
      warnings.push(`the page on bookdash.org could not be read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (textless) warnings.push("the repository has no text for this book: the story is only inside the pictures");

  // 2. Images.
  const files = new Map<string, { path: string; bytes: Uint8Array; contentType: string }>();
  const download = async (file: string, storedBase: string, required: boolean): Promise<string | undefined> => {
    const known = files.get(file);
    if (known) return known.path;
    say(`images/${file}`);
    try {
      const image = await client.image(slug, file);
      const path = bookMediaPath(bookId, `${storedBase}.${extensionForContentType(image.contentType)}`);
      files.set(file, { path, ...image });
      return path;
    } catch (err) {
      if (required || !(err instanceof BookDashError) || err.code !== "media") throw err;
      warnings.push(`${file} could not be downloaded: ${err.message}`);
      return undefined;
    }
  };

  /** A picture of the book's page on bookdash.org, used when the repository lacks the file. */
  const downloadWeb = async (url: string | undefined, storedBase: string): Promise<string | undefined> => {
    if (!url) return undefined;
    const known = files.get(url);
    if (known) return known.path;
    say(url.slice(url.lastIndexOf("/") + 1));
    try {
      const image = await fetchBookDashWebImage(url, options.webFetch);
      const path = bookMediaPath(bookId, `${storedBase}.${extensionForContentType(image.contentType)}`);
      files.set(url, { path, ...image });
      return path;
    } catch (err) {
      warnings.push(`${url} could not be downloaded: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };
  let webPictures = 0;

  const pages: Page[] = [];
  for (const [i, source] of parsed.pages.entries()) {
    const page: Page = { index: i, text: source.text };
    if (source.text) page.originalText = source.text;
    if (source.imageAlt) page.imageAlt = source.imageAlt;
    if (source.imageFile) {
      const storedBase = `page-${String(i + 1).padStart(2, "0")}`;
      const fallback = web?.spreads[i];
      const before = warnings.length;
      page.image = await download(source.imageFile, storedBase, !fallback);
      if (!page.image && fallback) {
        // The missing repository file is expected here; only a failed fallback is worth a warning.
        warnings.length = before;
        page.image = await downloadWeb(fallback, storedBase);
        if (page.image) webPictures += 1;
      }
    }
    pages.push(page);
  }
  const coverWarnings = warnings.length;
  let coverImage = await download(BOOKDASH.coverFile, "cover", false);
  if (!coverImage && web?.cover) {
    warnings.length = coverWarnings;
    coverImage = await downloadWeb(web.cover, "cover");
  }
  coverImage ??= pages.find((page) => page.image)?.image ?? "";
  if (webPictures > 0) {
    warnings.push(
      `${webPictures} page picture(s) come from ${web?.url}: they show the whole printed spread, with the English text in the picture`,
    );
  }
  const publisherLogo = await download(BOOKDASH.logoFile, "publisher-logo", false);
  if (!publisherLogo) warnings.push("the Book Dash logo is missing: the credit will show the publisher's name only");

  const credits: BookCredits = {
    publisher: BOOKDASH.publisher,
    publisherUrl: BOOKDASH.publisherUrl,
    attributionLine: BOOKDASH.attributionLine,
    originalTitle: title,
    ...(meta?.creator ? { creators: meta.creator } : {}),
    ...(web?.credits.designer ? { designer: web.credits.designer } : {}),
    ...(web?.credits.editor ? { editor: web.credits.editor } : {}),
    ...(publisherLogo ? { publisherLogo } : {}),
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
      slug,
      ownerId: options.ownerId,
      status: "draft",
      origin: "import",
      title,
      summary: meta?.description ?? "",
      // The repository does not say who did what (see the file comment); only the site does.
      author: web?.credits.author ?? "",
      illustrator: web?.credits.illustrator ?? "",
      license: BOOKDASH.license,
      source: bookDashSourceUrl(slug),
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
