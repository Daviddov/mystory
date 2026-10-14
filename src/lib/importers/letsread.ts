/**
 * Let's Read importer.
 *
 * Let's Read (https://www.letsreadasia.org, by The Asia Foundation) is a
 * library of picture books in many languages; its own books and those of
 * partner publishers. The site is a client of a JSON API that answers the
 * reader's own requests without an account. The importer uses four addresses,
 * none of them with a token:
 *
 *   https://letsreadasia.org/api/v5/book/search?lId=<language>&cursor=<cursor>    the catalogue of one language, 20 books a page
 *   https://letsreadasia.org/api/v5/book/preview/language/<language>/book/<id>    one book: metadata, credits by role, every page
 *   https://storage.googleapis.com/lets-read-asia/lets-read-epubs/<file>.epub     the EPUB the site offers for download
 *   https://storage.googleapis.com/lets-read-asia/<...>                           the illustrations
 *
 * <id> is the "masterBookId" of the book, the same for every language; the
 * site's own address of a book is /book/<id>?bookLang=<language>. The profile,
 * login and project endpoints of the API need a signed in user and are NOT used.
 *
 * A page is an illustration and its text as SEPARATE fields, so a translation
 * only replaces the text. The API pages are the story plus, in some books, a
 * title page in front and glossary, question, sponsor and back cover pages
 * behind it. Only the story pages are imported.
 *
 * License: the license is per book and most of the library is CC BY-NC. The
 * API has a "license" field; the book's own statement is the attribution page
 * ("Released under CC-BY-4.0"), which the web reader draws from that field and
 * which the EPUB carries as a stored page (Copyright.xhtml). The importer reads
 * that page out of the EPUB (two small range requests, not the whole file, which
 * is 10 MB of fonts) and needs both to say CC BY 4.0 or CC0. Everything else is
 * refused, a book without an attribution page included.
 *
 * Credits: author, illustrator and editor are the people the API lists under
 * that role (the attribution page prints the same lists). "Contributors" have
 * no role and are stored in credits.creators.
 *
 * Let's Read also carries books of Book Dash, StoryWeaver / Pratham Books and
 * the African Storybook, which this site imports from their own sources: see
 * LETSREAD_SKIPPED_PUBLISHERS. Many of its titles reached this site through
 * the Global Digital Library as well, so a book whose title is already in the
 * library is refused (see letsReadTitleKey).
 *
 * No "server-only" import and no getRepo(): the CLI (scripts/import-letsread.ts)
 * runs this under tsx. All network access goes through an injectable fetch.
 */
import { estimateReadingMinutes } from "../hebrew";
import { BOOK_LIMITS } from "../limits";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { Repository } from "../repo/types";
import { SLUG_PATTERN, type AgeGroup, type BookCredits, type BookWithPages, type Page } from "../types";
import type { FetchLike } from "./bookdash";
import { getCcLicense } from "./cc";
import { gdlLicensesInText, normalizeGdlLicense } from "./gdl";
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LETSREAD = {
  name: "Let's Read",
  /** How the site names itself as a publisher; credited when a book names no other. */
  publisher: "The Asia Foundation - Let's Read",
  url: "https://www.letsreadasia.org",
  apiBase: "https://letsreadasia.org/api",
  /** The bucket of the illustrations and of the EPUB files: the only place files are downloaded from, */
  mediaBase: "https://storage.googleapis.com/lets-read-asia/",
  /** except a picture wider than `maxImageWidth`, which is asked from the site's image server in that width. */
  servingBase: "https://lh3.googleusercontent.com/",
  maxImageWidth: 1600,
  /** The Let's Read id of English; the books are stored as English drafts. */
  languageId: "4846240843956224",
  /** The only licenses imported, as stored in Book.license (values of CC_LICENSES). */
  licenses: ["CC BY 4.0", "CC0 1.0"] as readonly string[],
} as const;

/**
 * Publishers whose books are imported from their own sources (see bookdash.ts,
 * storyweaver.ts and african-storybook.ts), so their Let's Read copies are
 * skipped. A book is skipped when its publisher, the address of its original
 * or its attribution page names one of them.
 */
export const LETSREAD_SKIPPED_PUBLISHERS: readonly { name: string; pattern: RegExp }[] = [
  { name: "Book Dash", pattern: /book\s*dash/i },
  { name: "StoryWeaver / Pratham Books", pattern: /story\s*weaver|pratham/i },
  { name: "African Storybook (Saide)", pattern: /african\s*storybook|\bsaide\b/i },
];

const CATALOGUE_PAGE_SIZE = 20;
/** The English catalogue is about 70 pages; a cursor that never ends stops here. */
const MAX_CATALOGUE_PAGES = 400;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_EPUB_BYTES = 80 * 1024 * 1024;
const MAX_CREDITS_BYTES = 512 * 1024;
/** The end of a zip file holds its table of contents; this much is asked for first. */
const EPUB_TAIL_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
/** Let's Read addresses a book by a UUID. */
const LETSREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A file inside the bucket: nothing that could leave it. Some old records say http. */
const MEDIA_URL = /^https?:\/\/storage\.googleapis\.com\/lets-read-asia\/[A-Za-z0-9][A-Za-z0-9._~%()+,'!@&=:/-]{0,400}$/;
const SERVING_URL = /^https:\/\/lh3\.googleusercontent\.com\/[A-Za-z0-9_-]{20,300}$/;

/** Stable id of the local copy of a Let's Read book: one copy per site, found again by its Let's Read id. */
export function letsReadBookId(id: string): string {
  return `letsread-${LETSREAD_ID.test(id) ? id : "0"}`;
}

/** The book's page on Let's Read, in the form the site itself gives a book; stored in Book.source. */
export function letsReadSourceUrl(id: string): string {
  return `${LETSREAD.url}/book/${id}?bookLang=${LETSREAD.languageId}`;
}

/** The name of the publisher to skip that `text` mentions, if any (see LETSREAD_SKIPPED_PUBLISHERS). */
export function letsReadSkippedPublisher(text: string): string | undefined {
  return LETSREAD_SKIPPED_PUBLISHERS.find((publisher) => publisher.pattern.test(text))?.name;
}

/** A title without case, accents and punctuation: "Why Don't They Sprout?" → "why dont they sprout". */
export function letsReadTitleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ'’‘`´]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type LetsReadErrorCode =
  | "invalid-id"
  | "not-found"
  | "rate-limited"
  | "network"
  | "invalid-book"
  | "no-text"
  | "license"
  | "publisher"
  | "duplicate"
  | "media";

const USER_MESSAGES: Record<LetsReadErrorCode, string> = {
  "invalid-id": "מזהה הספר במאגר אינו תקין.",
  "not-found": "הספר לא נמצא במאגר של Let's Read.",
  "rate-limited": "Let's Read הגביל זמנית את מספר הבקשות. נסו שוב בעוד כמה דקות.",
  network: "לא הצלחנו להתחבר למאגר של Let's Read. בדקו את החיבור ונסו שוב.",
  "invalid-book": "הספר במאגר אינו במבנה הצפוי, ולכן לא יובא.",
  "no-text": "הטקסט של הספר הזה נמצא בתוך האיורים או שאין בו טקסט, ולכן אי אפשר לייבא אותו.",
  license: "הרישיון של הספר אינו CC BY 4.0 או CC0, או שאי אפשר לאמת אותו, ולכן הוא לא יובא.",
  publisher: "הספרים של המוציא לאור הזה מיובאים מהמקור שלהם, ולא דרך Let's Read.",
  duplicate: "ספר בשם הזה כבר נמצא בספרייה.",
  media: "אחת התמונות של הספר חסרה, גדולה מדי או אינה תמונה תקינה.",
};

/** A refused or failed import. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class LetsReadError extends Error {
  readonly code: LetsReadErrorCode;
  readonly userMessage: string;

  constructor(code: LetsReadErrorCode, detail?: string) {
    super(detail ? `letsread import failed (${code}): ${detail}` : `letsread import failed (${code})`);
    this.name = "LetsReadError";
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

/** An HTML fragment without its tags, entities decoded, soft hyphens dropped, on one line. */
function inlineText(html: string): string {
  // An inline tag sits inside a sentence ("<em>roti</em>,"), so it leaves no space behind.
  const untagged = html.replace(/<\/?(?:em|strong|b|i|u|s|span|a|sub|sup|small|mark|font)\b[^>]*>/gi, "").replace(/<[^>]*>/g, " ");
  return decodeEntities(untagged)
    .replace(/­/g, "")
    .replace(/[\s ]+/g, " ")
    .trim();
}

/** The lines of an HTML fragment, one per paragraph or line break; empty lines are left out. */
function htmlLines(html: string): string[] {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .split("\n")
    .map(inlineText)
    .filter((line) => line !== "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s:,.]+|[\s,.;:]+$/g, "");
}

function sameWords(a: string, b: string): boolean {
  return letsReadTitleKey(a) !== "" && letsReadTitleKey(a) === letsReadTitleKey(b);
}

/** True for a license this importer accepts. A "CC BY" without a version only agrees with one; it is never enough alone. */
function isImportableLicense(license: string, allowVersionless = false): boolean {
  return LETSREAD.licenses.includes(license) || (allowVersionless && license === "CC BY");
}

/** The address a picture is downloaded from, or undefined when the record points outside Let's Read. */
function pictureUrl(original: string, serving: string, width: number): string | undefined {
  if (!MEDIA_URL.test(original) || original.includes("..")) return undefined;
  // A few books carry print-size pictures; the site's image server scales those down (it never scales up).
  if (width > LETSREAD.maxImageWidth && SERVING_URL.test(serving)) return `${serving}=w${LETSREAD.maxImageWidth}`;
  return original.replace(/^http:/, "https:");
}

export interface LetsReadPage {
  /** Full address of the illustration. Undefined for a page without a picture. */
  imageUrl?: string;
  /** Description of the illustration, when Let's Read has one. */
  imageAlt?: string;
  text: string;
}

export interface ParsedLetsReadBook {
  /** The masterBookId: the id every address of the book takes. */
  id: string;
  title: string;
  description: string;
  /** Let's Read's own slug of the book; many books have none. */
  slug: string;
  /** The "license" field, normalized ("CC BY 4.0"). Empty when the record names none. */
  license: string;
  /** Reading level, "0" (first books) to "5". Empty when unknown. */
  level: string;
  coverImageUrl?: string;
  /** The EPUB of the book, which holds its attribution page. Undefined when the record has none in the bucket. */
  epubUrl?: string;
  /** Publishers the record lists. Empty when it lists none (the attribution page then credits Let's Read). */
  publisher: string;
  /** Address of the original book, when the record gives a real one. */
  originalUrl?: string;
  /** People the record lists under a role. Empty when it lists none. */
  author: string;
  illustrator: string;
  translator: string;
  editor: string;
  designer: string;
  /** "Contributors": people listed without a role. */
  creators: string;
  pages: LetsReadPage[];
  /** Set when the publisher or the original address names a publisher of LETSREAD_SKIPPED_PUBLISHERS. */
  skippedPublisher?: string;
  warnings: string[];
}

/** A logo, sponsor or back cover picture, by the name Let's Read gives those files. */
const MATTER_IMAGE = /(?:^|\/)(?:back|logos?\d*|founders?)\.(?:png|jpe?g|webp|gif)$/i;
const TITLE_IMAGE = /(?:^|\/)cover\.(?:png|jpe?g|webp|gif)$/i;
const BYLINE = /^(?:written|illustrated|translated|edited|designed|story|pictures|illustrations|text|photographs?)\b[^.!?]{0,80}\bby\b|^by\s/i;
/** What a page after the story starts with or says: thanks, sponsors, glossaries, questions, the license. */
const MATTER_TEXT = new RegExp(
  [
    // sponsors and thanks
    /made possible (?:by|through|with)|(?:created|produced|developed|published) with the support of|received assistance|^we (?:would like to )?thank\b|^(?:many |special )?thanks to\b|brought to you by/,
    // the license
    /released under|rights reserved|creative\s*commons|©|\(c\)\s*\d{4}/,
    // a publisher presenting itself
    /\bpublishes (?:quality|children)|\bis a (?:non-?profit|social enterprise)\b|^badan (?:pengembangan|bahasa)\b/,
    // glossaries, questions and notes
    /^(?:comprehension |discussion )?questions?(?![a-z])|^wonderful words|^(?:glossary|activit(?:y|ies)|acknowledge?ments?|credits|dedication)(?![a-z])|^about the (?:author|illustrator|book|story)|^more about\b|^the end\.?$/,
  ]
    .map((part) => part.source)
    .join("|"),
  "i",
);

interface SourcePage {
  number: number;
  image: string;
  imageUrl?: string;
  alt: string;
  lines: string[];
}

/** A person entry names itself in "name", or (in book.authors) only in "firstname" and "lastname". */
function personName(person: unknown): string {
  const entry = record(person);
  return text(entry.name) || [text(entry.firstname), text(entry.lastname)].filter(Boolean).join(" ");
}

function roleNames(roles: Record<string, unknown>, role: string, extra: unknown = undefined): string {
  const names = [...list(roles[role]).map(personName), ...list(extra).map((person) => personName(person) || text(person))];
  if (typeof extra === "string") names.push(extra);
  return names
    // The legacy book.authors may hold two people in one entry: "A and B".
    .flatMap((name) => name.split(/\s+and\s+/))
    .map(cleanName)
    .filter((name, i, all) => name && all.indexOf(name) === i)
    .join(", ");
}

/** Parses the answer of v5/book/preview/language/<language>/book/<id>. */
export function parseLetsReadBook(body: unknown): ParsedLetsReadBook {
  const warnings: string[] = [];
  const book = record(body);
  const id = text(book.masterBookId) || text(book.id);
  if (!LETSREAD_ID.test(id)) throw new LetsReadError("invalid-book", "the answer is not a book");
  if (text(book.languageId) !== LETSREAD.languageId) throw new LetsReadError("invalid-book", `${id} is not the English edition`);
  const pagesIn = list(book.pages);
  if (pagesIn.length === 0) throw new LetsReadError("invalid-book", `${id} holds no pages`);

  const title = inlineText(text(book.name));
  const cover = text(book.coverImageUrl);
  const coverImageUrl = pictureUrl(cover, "", 0);

  // 1. Every page as its picture and its lines of text, in reading order.
  const source: SourcePage[] = pagesIn
    .map(record)
    .filter((page) => page.deleted !== true)
    .map((page) => {
      const image = text(page.imageUrl);
      const imageUrl = pictureUrl(image, text(page.imageServingUrl), Number(page.imageWidth) || 0);
      if (image && !imageUrl) warnings.push(`a picture outside Let's Read was left out: ${image.slice(0, 120)}`);
      return {
        number: Number(page.pageNum) || 0,
        image,
        ...(imageUrl ? { imageUrl } : {}),
        alt: inlineText(text(page.alttext) || text(page.imageAltDescription)),
        // A line of dots or dashes only is a placeholder under a picture, not text.
        lines: htmlLines(text(page.extractedLongContentValue)).filter((line) => /[\p{L}\p{N}]/u.test(line)),
      };
    })
    .sort((a, b) => a.number - b.number);

  // 2. Story pages. Title pages in front and everything after the story (glossary, questions,
  //    sponsors, back cover) are dropped: from the end, while a page is one of those or empty.
  const isMatter = (page: SourcePage) =>
    MATTER_IMAGE.test(page.image) || page.lines.some((line) => MATTER_TEXT.test(line)) || (!page.imageUrl && page.lines.length === 0);
  // A title page says the title and nothing else ("Going To School"), or the title and who made the book.
  // A first sentence that only reads like the title ("Crab and Fish are friends.") is the story.
  const isTitlePage = (page: SourcePage) => {
    if (page.lines.length === 0) return TITLE_IMAGE.test(page.image) || (cover !== "" && page.image === cover);
    if (!sameWords(page.lines[0], title)) return false;
    const bylines = page.lines.slice(1);
    return bylines.length > 0 ? bylines.every((line) => BYLINE.test(line)) : !/[.!?]["”’]?$/.test(page.lines[0]);
  };
  let end = source.length;
  while (end > 0 && isMatter(source[end - 1])) end -= 1;
  let start = 0;
  while (start < end && isTitlePage(source[start])) start += 1;

  const pages: LetsReadPage[] = [];
  for (const page of source.slice(start, end)) {
    if (!page.imageUrl && page.lines.length === 0) continue;
    pages.push({
      ...(page.imageUrl ? { imageUrl: page.imageUrl } : {}),
      ...(page.imageUrl && page.alt && !sameWords(page.alt, title) ? { imageAlt: page.alt } : {}),
      text: page.lines.join("\n"),
    });
  }

  // 3. Credits: the people and publishers the record lists under a role.
  const roles = record(book.collaboratorsByRole);
  const publisher = roleNames(roles, "PUBLISHER", text(book.publisher));
  const original = text(book.originalUrl);
  const originalUrl = /^https?:\/\/[^\s/"'<>]+\.[^\s"'<>]+$/i.test(original) && !/letsreadasia\.org/i.test(original) ? original : undefined;
  const skippedPublisher = letsReadSkippedPublisher(`${publisher}\n${original}`);
  const author = roleNames(roles, "AUTHOR", book.authors);
  const illustrator = roleNames(roles, "ILLUSTRATOR", text(book.illustrator));

  if (!title) warnings.push("the book has no title");
  if (!author) warnings.push("the record names no author");
  if (!illustrator) warnings.push("the record names no illustrator");
  pages.forEach((page, i) => {
    if (page.imageUrl && !page.text) warnings.push(`page ${i + 1} has a picture but no text`);
    if (!page.imageUrl && page.text) warnings.push(`page ${i + 1} has text but no picture`);
  });

  const epub = text(book.epubUrl);
  return {
    id,
    title,
    description: htmlLines(text(book.description)).join("\n"),
    slug: text(book.slug),
    license: text(book.license) ? normalizeGdlLicense(text(book.license)) : "",
    level: text(book.readingLevel),
    ...(coverImageUrl ? { coverImageUrl } : {}),
    ...(MEDIA_URL.test(epub) && /\/lets-read-epubs\/[^/]+\.epub$/i.test(epub) && !epub.includes("..") ? { epubUrl: epub.replace(/^http:/, "https:") } : {}),
    publisher,
    ...(originalUrl ? { originalUrl } : {}),
    author,
    illustrator,
    translator: roleNames(roles, "TRANSLATOR"),
    editor: roleNames(roles, "EDITOR"),
    designer: roleNames(roles, "DESIGNER"),
    creators: roleNames(roles, "CONTRIBUTOR"),
    pages,
    ...(skippedPublisher ? { skippedPublisher } : {}),
    warnings,
  };
}

export interface LetsReadCredits {
  /** Licenses the attribution page states, e.g. ["CC BY 4.0"]. Empty when it states none. */
  statedLicenses: string[];
  /** The credits and copyright sentences of the book, in its own wording. */
  attribution: string;
  /** "Published by ..." on the page. Empty when the page names no publisher. */
  publisher: string;
  /** People the page names with a role ("Author: ..."). Empty when it does not say. */
  author: string;
  illustrator: string;
  /** The whole page as text, for the publisher filter. */
  text: string;
}

const ROLE = /\b(Author|Illustrator)s?\s*:\s*(.*?)(?=\.\s|\.?\s*(?:\b(?:Author|Illustrator|Editor|Contributor)s?\s*:|Published by\b|©|$))/gi;

/**
 * Parses the attribution page of a book (Copyright.xhtml of its EPUB): the
 * original story with its makers and publisher, and the license sentence.
 */
export function parseLetsReadCredits(xhtml: string): LetsReadCredits {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  // The upper half of the page presents Let's Read itself; the book's own credits follow it.
  const own = body.split(/<div\b[^>]*class=['"][^'"]*\battribution__bottom\b[^'"]*['"][^>]*>/i)[1] ?? body;
  const paragraphs = own
    .split(/<\/\s*p\s*>/i)
    .map((paragraph) =>
      inlineText(paragraph)
        // What the page prints where the record has no address, and a role nobody is named for ("Illustrator:.").
        .replace(/,?\s*#_url_#/g, "")
        .replace(/\b(?:Author|Illustrator|Editor|Contributor)s?\s*:\s*\.(?=\s|$)/g, "")
        .replace(/\s+([.,])/g, "$1")
        .replace(/\?\./g, "?")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const attribution = paragraphs
    .filter((line) => /©|@|released under|rights reserved|licen[sc]ed|original story|published by|modified version/i.test(line))
    .filter((line) => !/^for full terms/i.test(line))
    .join(" ");

  const roles: Record<string, string> = {};
  for (const match of attribution.matchAll(ROLE)) {
    const role = match[1].toLowerCase();
    const name = cleanName(match[2]);
    if (name && !roles[role]) roles[role] = name;
  }
  const links = [...body.matchAll(/href=['"]([^'"]+)['"]/gi)].map((match) => match[1]).join(" ");
  const whole = inlineText(body);
  return {
    statedLicenses: gdlLicensesInText(`${whole} ${links}`),
    attribution,
    publisher: cleanName(/Published by\s+([^©]+?)\s*(?:,\s*(?:https?:|www\.|[A-Za-z0-9-]+\.[a-z]{2,}\b)|,?\s*©|\.\s|$)/i.exec(attribution)?.[1] ?? ""),
    author: roles.author ?? "",
    illustrator: roles.illustrator ?? "",
    text: `${whole} ${links}`,
  };
}

export interface LetsReadCatalogueEntry {
  /** The masterBookId: the id every other call takes. */
  id: string;
  title: string;
  description: string;
  /** License in the catalogue, normalized ("CC BY 4.0"). Empty when the catalogue names none. */
  license: string;
  /** Reading level, "0" to "5". */
  level: string;
  /** Pages of the book as Let's Read counts them (the cover and back matter included). */
  pages: number;
  /** Country the book comes from; empty for many books. */
  country: string;
}

/** Parses one page of v5/book/search: { featured, other, cursorWebSafeString }. Entries without an id are left out. */
export function parseLetsReadCatalogue(body: unknown): { entries: LetsReadCatalogueEntry[]; cursor: string } {
  const answer = record(body);
  const entries: LetsReadCatalogueEntry[] = [];
  for (const itemIn of [...list(answer.featured), ...list(answer.other)]) {
    const item = record(itemIn);
    const id = text(item.masterBookId) || text(item.id);
    if (!LETSREAD_ID.test(id) || text(item.languageId) !== LETSREAD.languageId) continue;
    entries.push({
      id,
      title: inlineText(text(item.name)) || id,
      description: inlineText(text(item.description)),
      license: text(item.license) ? normalizeGdlLicense(text(item.license)) : "",
      level: text(item.readingLevel),
      pages: Number(item.totalPages) || 0,
      country: text(item.countryOfOrigin),
    });
  }
  return { entries, cursor: text(answer.cursorWebSafeString) };
}

/**
 * Why a catalogue entry is not worth downloading, or undefined when it may be
 * importable. The catalogue does not name publishers; the book itself is still
 * checked by importLetsReadBook.
 */
export function letsReadCatalogueProblem(entry: LetsReadCatalogueEntry): string | undefined {
  if (!isImportableLicense(entry.license)) return `license ${entry.license || "unknown"}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Zip (pure): just enough to take one file out of an EPUB without downloading all of it
// ---------------------------------------------------------------------------

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

/** Where the table of contents of a zip file is, read from the record at its very end. */
function zipDirectory(tail: Uint8Array): { offset: number; size: number } | undefined {
  for (let at = tail.length - 22; at >= 0; at--) {
    if (u32(tail, at) === 0x06054b50) return { size: u32(tail, at + 12), offset: u32(tail, at + 16) };
  }
  return undefined;
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Where the entry's own header starts in the file. */
  offset: number;
}

function zipEntries(directory: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  for (let at = 0; at + 46 <= directory.length && u32(directory, at) === 0x02014b50; ) {
    const nameLength = u16(directory, at + 28);
    entries.push({
      name: new TextDecoder().decode(directory.subarray(at + 46, at + 46 + nameLength)),
      method: u16(directory, at + 10),
      compressedSize: u32(directory, at + 20),
      size: u32(directory, at + 24),
      offset: u32(directory, at + 42),
    });
    at += 46 + nameLength + u16(directory, at + 30) + u16(directory, at + 32);
  }
  return entries;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface LetsReadClientOptions {
  /** Defaults to the global fetch. Tests pass a stub, so they never touch the network. */
  fetch?: FetchLike;
}

export class LetsReadClient {
  private readonly fetchImpl: FetchLike;
  private known: Promise<LetsReadCatalogueEntry[]> | undefined;

  constructor(options: LetsReadClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
  }

  private async request(url: string, headers: Record<string, string> = {}) {
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { "User-Agent": "mystory-letsread-importer", ...headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new LetsReadError("network", `${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (response.status === 404) throw new LetsReadError("not-found", url);
    if (response.status === 429) throw new LetsReadError("rate-limited", url);
    // A book that needs a signed in reader is not one this importer may take.
    if (response.status === 401 || response.status === 403) throw new LetsReadError("not-found", `${url}: HTTP ${response.status}`);
    if (!response.ok) throw new LetsReadError("network", `${url}: HTTP ${response.status}`);
    return response;
  }

  private async json(url: string): Promise<Record<string, unknown>> {
    const response = await this.request(url, { Accept: "application/json" });
    const body = await response.text();
    if (body.length > MAX_JSON_BYTES) throw new LetsReadError("invalid-book", `${url} is too large`);
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // falls through
    }
    throw new LetsReadError("invalid-book", `${url} did not answer with JSON`);
  }

  /** Every English book, in catalogue order (newest first), one entry per book. Fetched once per client. */
  catalogue(): Promise<LetsReadCatalogueEntry[]> {
    if (!this.known) {
      this.known = this.readCatalogue();
      this.known.catch(() => (this.known = undefined));
    }
    return this.known;
  }

  private async readCatalogue(): Promise<LetsReadCatalogueEntry[]> {
    const entries: LetsReadCatalogueEntry[] = [];
    const seen = new Set<string>();
    let cursor = "";
    for (let page = 0; page < MAX_CATALOGUE_PAGES; page++) {
      const url = `${LETSREAD.apiBase}/v5/book/search?cardName=&limit=${CATALOGUE_PAGE_SIZE}&fLimit=${CATALOGUE_PAGE_SIZE}&lId=${LETSREAD.languageId}&cursor=${encodeURIComponent(cursor)}`;
      const answer = parseLetsReadCatalogue(await this.json(url));
      const fresh = answer.entries.filter((entry) => !seen.has(entry.id));
      for (const entry of fresh) {
        seen.add(entry.id);
        entries.push(entry);
      }
      // The last page has no cursor; a page that repeats known books would loop forever.
      if (fresh.length === 0 || !answer.cursor || answer.cursor === cursor) break;
      cursor = answer.cursor;
    }
    return entries;
  }

  /** One book with its pages (see parseLetsReadBook). */
  async book(id: string): Promise<ParsedLetsReadBook> {
    if (!LETSREAD_ID.test(id)) throw new LetsReadError("invalid-id", id);
    const parsed = parseLetsReadBook(await this.json(`${LETSREAD.apiBase}/v5/book/preview/language/${LETSREAD.languageId}/book/${id}`));
    if (parsed.id !== id) throw new LetsReadError("invalid-book", `${id}: the answer is the book ${parsed.id}`);
    return parsed;
  }

  /** Part of a file: `range` is an HTTP Range value. A server that ignores it answers with the whole file. */
  private async bytes(url: string, range: string, first: number): Promise<{ bytes: Uint8Array; offset: number }> {
    const response = await this.request(url, { Range: `bytes=${range}` });
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_EPUB_BYTES) throw new LetsReadError("invalid-book", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.status !== 206) return { bytes, offset: 0 };
    const start = /^bytes (\d+)-/.exec(response.headers.get("content-range") ?? "")?.[1];
    return { bytes, offset: start === undefined ? first : Number(start) };
  }

  /**
   * The attribution page of a book, taken out of its EPUB: the end of the file
   * (its table of contents), then the bytes of Copyright.xhtml alone.
   */
  async credits(epubUrl: string): Promise<LetsReadCredits> {
    if (!MEDIA_URL.test(epubUrl) || !epubUrl.startsWith(`${LETSREAD.mediaBase}lets-read-epubs/`) || epubUrl.includes("..")) {
      throw new LetsReadError("invalid-book", `unsafe epub address ${epubUrl}`);
    }
    const tail = await this.bytes(epubUrl, `-${EPUB_TAIL_BYTES}`, 0);
    const directory = zipDirectory(tail.bytes);
    if (!directory) throw new LetsReadError("invalid-book", `${epubUrl} is not an EPUB`);
    /** The bytes [from, to) of the file: out of what is already here, or by another request. */
    const part = async (from: number, to: number): Promise<Uint8Array> => {
      if (from >= tail.offset) return tail.bytes.subarray(from - tail.offset, to - tail.offset);
      const more = await this.bytes(epubUrl, `${from}-${to - 1}`, from);
      return more.bytes.subarray(from - more.offset, to - more.offset);
    };
    const entry = zipEntries(await part(directory.offset, directory.offset + directory.size)).find((item) => /(?:^|\/)copyright\.x?html$/i.test(item.name));
    if (!entry) throw new LetsReadError("license", `${epubUrl} holds no attribution page`);
    if (entry.size > MAX_CREDITS_BYTES || entry.compressedSize > MAX_CREDITS_BYTES) throw new LetsReadError("invalid-book", `${epubUrl}: the attribution page is too large`);
    // The entry's own header repeats its name and may carry extra fields of unknown length.
    const local = await part(entry.offset, Math.min(directory.offset, entry.offset + 30 + entry.name.length * 4 + 1024 + entry.compressedSize));
    if (local.length < 30 || u32(local, 0) !== 0x04034b50) throw new LetsReadError("invalid-book", `${epubUrl}: the attribution page is cut off`);
    const from = 30 + u16(local, 26) + u16(local, 28);
    const data = local.subarray(from, from + entry.compressedSize);
    if (data.length < entry.compressedSize || (entry.method !== 0 && entry.method !== 8)) {
      throw new LetsReadError("invalid-book", `${epubUrl}: the attribution page cannot be read`);
    }
    let page: Uint8Array;
    try {
      page = entry.method === 0 ? data : await inflateRaw(data);
    } catch {
      throw new LetsReadError("invalid-book", `${epubUrl}: the attribution page cannot be read`);
    }
    return parseLetsReadCredits(new TextDecoder().decode(page));
  }

  /** One illustration, checked to come from Let's Read's storage and to really be an image. */
  async image(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const scaled = url.startsWith(LETSREAD.servingBase) && SERVING_URL.test(url.replace(/=w\d{3,4}$/, ""));
    if (!scaled && (!MEDIA_URL.test(url) || !url.startsWith(LETSREAD.mediaBase) || url.includes(".."))) throw new LetsReadError("media", `unsafe image url ${url}`);
    let response;
    try {
      response = await this.request(url);
    } catch (err) {
      if (err instanceof LetsReadError && err.code === "not-found") throw new LetsReadError("media", `${url} is missing`);
      throw err;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMPORT_LIMITS.imageBytes) throw new LetsReadError("media", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new LetsReadError("media", `${url} is too large`);
    const contentType = detectImageType(bytes);
    if (!contentType || contentType === "image/svg+xml") throw new LetsReadError("media", `${url} is not an image`);
    return { bytes, contentType };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface LetsReadImportOptions {
  /** The masterBookId of the book, e.g. "cb81651f-a65f-49b2-8bbe-da7e2197b31e". */
  id: string;
  ownerId: string;
  repo: Repository;
  media: MediaStore;
  client?: LetsReadClient;
  /** Replace an existing copy (its text, translation, narration and media are deleted). Default false. */
  force?: boolean;
  /** Import a book of a publisher in LETSREAD_SKIPPED_PUBLISHERS anyway. Default false: it is refused. */
  includeSkippedPublishers?: boolean;
  /**
   * Titles that are in the library already, as letsReadTitleKey → the id of the book that has it
   * (see letsReadKnownTitles). A book with one of these titles is refused, unless it is that book.
   */
  knownTitles?: ReadonlyMap<string, string>;
  /** Called before each download, for progress output. */
  onProgress?: (message: string) => void;
}

export interface LetsReadImportResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
  /** Parser and download notes for a person to review. Empty for a skipped book. */
  warnings: string[];
}

/** The local copy of a Let's Read book, if it was imported before. */
export async function findLetsReadBook(repo: Repository, id: string): Promise<BookWithPages | null> {
  if (!LETSREAD_ID.test(id)) return null;
  return repo.getBookById(letsReadBookId(id));
}

/**
 * The titles of every book in the library, current and original, for
 * LetsReadImportOptions.knownTitles: the same story often reached the library
 * from another source (the Global Digital Library republishes Let's Read).
 */
export async function letsReadKnownTitles(repo: Repository): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const { books } = await repo.listBooks({ status: "any" });
  for (const book of books) {
    for (const title of [book.title, book.credits?.originalTitle ?? ""]) {
      const key = letsReadTitleKey(title);
      if (key && !titles.has(key)) titles.set(key, book.id);
    }
  }
  return titles;
}

/** Let's Read reading levels ("0", first books, to "5") mapped to this site's age groups. */
function ageGroupFor(level: string, textChars: number): AgeGroup {
  if (level === "0" || level === "1") return "3-5";
  if (/^[2-5]$/.test(level)) return "6-8";
  return textChars < 1200 ? "3-5" : "6-8";
}

function cut(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function sameNames(a: string, b: string): boolean {
  const key = (value: string) => value.split(",").map(letsReadTitleKey).filter(Boolean).sort().join(",");
  return key(a) === key(b);
}

/** "letsread-<Let's Read's slug, or the title in latin letters>"; the book id when neither gives one. */
function slugFor(parsed: ParsedLetsReadBook, bookId: string): string {
  const fromTitle = letsReadTitleKey(parsed.title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const words = SLUG_PATTERN.test(parsed.slug) ? parsed.slug : fromTitle;
  const slug = `letsread-${words.slice(0, 70).replace(/-+$/, "")}`;
  return words && SLUG_PATTERN.test(slug) ? slug : bookId;
}

/**
 * The license to store, or a LetsReadError when the record and the book's
 * attribution page do not both say CC BY 4.0 or CC0 (see the file comment).
 */
function agreedLicense(id: string, recordLicense: string, credits: LetsReadCredits): string {
  if (!isImportableLicense(recordLicense)) throw new LetsReadError("license", `${id}: the record says ${recordLicense || "nothing"}`);
  for (const license of credits.statedLicenses) {
    if (!isImportableLicense(license, true)) throw new LetsReadError("license", `${id}: the book itself says ${license} (the record says ${recordLicense})`);
  }
  if (!credits.statedLicenses.some((license) => isImportableLicense(license))) {
    throw new LetsReadError("license", `${id}: the book itself states no license, and the record's ${recordLicense} alone is not trusted`);
  }
  // CC0 only when nothing asks for attribution.
  const all = [recordLicense, ...credits.statedLicenses];
  const license = all.every((value) => value === "CC0 1.0") ? "CC0 1.0" : "CC BY 4.0";
  if (!getCcLicense(license)?.allowsAdaptation) throw new LetsReadError("license", `${id}: ${license}`);
  return license;
}

/**
 * Downloads one book and creates a DRAFT in English: text = originalText =
 * the English text, language 'en', until someone translates it. Idempotent:
 * a book that was imported before is returned untouched unless `force`.
 */
export async function importLetsReadBook(options: LetsReadImportOptions): Promise<LetsReadImportResult> {
  const { id, repo, media } = options;
  if (!LETSREAD_ID.test(id)) throw new LetsReadError("invalid-id", id);
  const client = options.client ?? new LetsReadClient();
  const say = options.onProgress ?? (() => undefined);
  const bookId = letsReadBookId(id);

  const existing = await repo.getBookById(bookId);
  if (existing && !options.force) return { status: "skipped", book: existing, warnings: [] };
  if (existing?.status === "published") {
    throw new LetsReadError("invalid-book", `${id} is published; move it back to private before replacing it`);
  }

  // 1. Text and metadata. Nothing is stored until everything was downloaded and checked.
  say("book");
  const parsed = await client.book(id);
  const warnings = [...parsed.warnings];
  if (!isImportableLicense(parsed.license)) throw new LetsReadError("license", `${id}: the record says ${parsed.license || "nothing"}`);
  if (parsed.skippedPublisher && !options.includeSkippedPublishers) throw new LetsReadError("publisher", `${id}: ${parsed.skippedPublisher}`);
  const twin = options.knownTitles?.get(letsReadTitleKey(parsed.title));
  if (twin && twin !== bookId) throw new LetsReadError("duplicate", `${id}: "${parsed.title}" is in the library already as ${twin}`);

  say("attribution page");
  if (!parsed.epubUrl) throw new LetsReadError("license", `${id}: the book has no attribution page to state its license`);
  const credits = await client.credits(parsed.epubUrl);
  const skipped = letsReadSkippedPublisher(`${credits.publisher}\n${credits.text}`);
  if (skipped && !options.includeSkippedPublishers) throw new LetsReadError("publisher", `${id}: ${skipped}`);
  const license = agreedLicense(id, parsed.license, credits);

  if (parsed.pages.length === 0) throw new LetsReadError("invalid-book", `${id} has no story pages`);
  // Pictures without text next to them: a wordless book, or one whose words are painted into the pictures.
  const withText = parsed.pages.filter((page) => page.text !== "").length;
  const pictureOnly = parsed.pages.filter((page) => page.imageUrl && page.text === "").length;
  if (withText === 0 || pictureOnly > withText) throw new LetsReadError("no-text", `${id}: ${pictureOnly} of ${parsed.pages.length} pages are a picture without text`);
  if (parsed.pages.length > BOOK_LIMITS.pages) throw new LetsReadError("invalid-book", `${id} has too many pages`);
  for (const page of parsed.pages) {
    if (page.text.length > BOOK_LIMITS.pageTextChars) throw new LetsReadError("invalid-book", `${id}: a page is too long`);
  }
  if (!parsed.title) throw new LetsReadError("invalid-book", `${id} has no title`);

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
    if (source.text) page.originalText = source.text;
    if (source.imageAlt) page.imageAlt = cut(source.imageAlt, 1000);
    if (source.imageUrl) page.image = await download(source.imageUrl, `page-${String(i + 1).padStart(2, "0")}`);
    pages.push(page);
  }
  let coverImage = pages.find((page) => page.image)?.image ?? "";
  if (parsed.coverImageUrl) {
    try {
      coverImage = await download(parsed.coverImageUrl, "cover");
    } catch (err) {
      if (!(err instanceof LetsReadError) || err.code !== "media") throw err;
      warnings.push(`the cover could not be downloaded: ${err.message}`);
    }
  }

  // The record and the attribution page come from the same lists; a difference is worth a look.
  const author = parsed.author || credits.author;
  const illustrator = parsed.illustrator || credits.illustrator;
  if (credits.author && !sameNames(credits.author, author)) warnings.push(`the attribution page names the author ${credits.author}, the record ${author}`);
  if (credits.illustrator && !sameNames(credits.illustrator, illustrator)) warnings.push(`the attribution page names the illustrator ${credits.illustrator}, the record ${illustrator}`);
  const publisher = parsed.publisher || credits.publisher;
  if (!publisher) warnings.push(`the book names no publisher: ${LETSREAD.publisher} is credited`);
  const bookCredits: BookCredits = {
    publisher: cut(publisher || LETSREAD.publisher, 200),
    // The address of the original when the record gives one; otherwise the library the book was taken from.
    publisherUrl: cut(parsed.originalUrl ?? LETSREAD.url, 500),
    ...(credits.attribution ? { attributionLine: cut(credits.attribution, 500) } : {}),
    originalTitle: cut(parsed.title, 200),
    ...(parsed.translator ? { translator: cut(parsed.translator, 200) } : {}),
    ...(parsed.editor ? { editor: cut(parsed.editor, 200) } : {}),
    ...(parsed.designer ? { designer: cut(parsed.designer, 200) } : {}),
    ...(parsed.creators ? { creators: cut(parsed.creators, 300) } : {}),
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
      slug: slugFor(parsed, bookId),
      ownerId: options.ownerId,
      status: "draft",
      origin: "import",
      title: cut(parsed.title, 200),
      summary: cut(parsed.description, 2000),
      // Only the people the source names under that role (see the file comment); never a guess.
      author: cut(author, 200),
      illustrator: cut(illustrator, 200),
      license,
      source: letsReadSourceUrl(id),
      ageGroup: ageGroupFor(parsed.level, pages.reduce((sum, page) => sum + page.text.length, 0)),
      language: "en",
      originalLanguage: "en",
      credits: bookCredits,
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
