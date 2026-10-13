/**
 * Global Digital Library importer.
 *
 * The Global Digital Library (GDL, https://digitallibrary.io) collects openly
 * licensed picture books of many publishers. Its content site answers three
 * public endpoints without an account (https://content.digitallibrary.io/api/):
 *
 *   /wp-json/content-api/v1/books/<language code>   every book of one language, in one answer
 *   /wp-json/content-api/v1/h5p/<h5p id>            one book: H5P "interactive book" parameters
 *   /wp-content/uploads/h5p/content/<h5p id>/images/<file>   its illustrations
 *
 * A book is a list of chapters (H5P.Column), one per page; a page holds an
 * illustration (H5P.Image, with a description) and its text (H5P.AdvancedText)
 * as SEPARATE items, so a translation only replaces the text. The first page
 * repeats the cover and the title; the last pages hold logos and the credits.
 * Only the story pages are imported.
 *
 * License: the license in the catalogue is NOT reliable. Books listed there as
 * CC-BY-4.0 say "Released under CC-BY-NC-4.0" on their own credits page. The
 * importer therefore needs three things to agree: the catalogue, the license
 * of every item inside the book, and the license the credits page states. It
 * imports CC BY 4.0 and CC0 only and refuses everything else, a book that
 * states no license on its pages included.
 *
 * Credits: the "contributors" of the H5P cover are not reliable either (a
 * translator was found listed there as "Author"). Author and illustrator are
 * taken only from "Author: ..." / "Illustrator: ..." lines of the book's own
 * pages; names the cover lists that the pages do not confirm are stored in
 * credits.creators and never turned into a role.
 *
 * GDL also carries books of Book Dash, StoryWeaver / Pratham Books and the
 * African Storybook, which this site imports from their own sources: see
 * GDL_SKIPPED_PUBLISHERS.
 *
 * No "server-only" import and no getRepo(): the CLI (scripts/import-gdl.ts)
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
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GDL = {
  name: "Global Digital Library",
  url: "https://digitallibrary.io",
  apiBase: "https://content.digitallibrary.io/wp-json/content-api/v1",
  /** The only place illustrations are downloaded from; "/<h5p id>/images/<file>" follows. */
  mediaBase: "https://content.digitallibrary.io/wp-content/uploads/h5p/content",
  /** The GDL language code of the books that are imported; they are stored as English drafts. */
  language: "en",
  /** The H5P content type of a picture book. Videos, games and other types are not books of pages. */
  library: "H5P.InteractiveBookSimple",
  /** The only licenses imported, as stored in Book.license (values of CC_LICENSES). */
  licenses: ["CC BY 4.0", "CC0 1.0"] as readonly string[],
} as const;

/**
 * Publishers whose books are imported from their own sources (see bookdash.ts
 * and storyweaver.ts), so their GDL copies are skipped. A book is skipped when
 * the catalogue, its cover or its credits pages name one of them.
 */
export const GDL_SKIPPED_PUBLISHERS: readonly { name: string; pattern: RegExp }[] = [
  { name: "Book Dash", pattern: /book\s*dash/i },
  { name: "StoryWeaver / Pratham Books", pattern: /story\s*weaver|pratham/i },
  { name: "African Storybook (Saide)", pattern: /african\s+storybook|\bsaide\b/i },
];

/** The catalogue of one language is a single answer of several megabytes. */
const MAX_CATALOGUE_BYTES = 32 * 1024 * 1024;
const MAX_BOOK_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
/** GDL addresses a book by the numeric id of its H5P content. */
const GDL_ID = /^[1-9]\d{0,9}$/;
/** An illustration inside a book: "images/<file>", nothing that could leave the folder. */
const IMAGE_PATH = /^images\/[A-Za-z0-9][A-Za-z0-9._ ()-]{0,150}$/;

/** Stable id of the local copy of a GDL book: one copy per site, found again by its GDL id. */
export function gdlBookId(id: string): string {
  return `gdl-${GDL_ID.test(id) ? id : "0"}`;
}

/** The name of the publisher to skip that `text` mentions, if any (see GDL_SKIPPED_PUBLISHERS). */
export function gdlSkippedPublisher(text: string): string | undefined {
  return GDL_SKIPPED_PUBLISHERS.find((publisher) => publisher.pattern.test(text))?.name;
}

export type GdlErrorCode =
  | "invalid-id"
  | "not-found"
  | "rate-limited"
  | "network"
  | "invalid-book"
  | "no-text"
  | "license"
  | "publisher"
  | "media";

const USER_MESSAGES: Record<GdlErrorCode, string> = {
  "invalid-id": "מספר הספר במאגר אינו תקין.",
  "not-found": "הספר לא נמצא במאגר של Global Digital Library.",
  "rate-limited": "Global Digital Library הגביל זמנית את מספר הבקשות. נסו שוב בעוד כמה דקות.",
  network: "לא הצלחנו להתחבר למאגר של Global Digital Library. בדקו את החיבור ונסו שוב.",
  "invalid-book": "הספר במאגר אינו במבנה הצפוי, ולכן לא יובא.",
  "no-text": "הטקסט של הספר הזה נמצא בתוך האיורים או שאין בו טקסט, ולכן אי אפשר לייבא אותו.",
  license: "הרישיון של הספר אינו CC BY 4.0 או CC0, או שאי אפשר לאמת אותו, ולכן הוא לא יובא.",
  publisher: "הספרים של המוציא לאור הזה מיובאים מהמקור שלהם, ולא דרך Global Digital Library.",
  media: "אחת התמונות של הספר חסרה, גדולה מדי או אינה תמונה תקינה.",
};

/** A refused or failed import. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class GdlError extends Error {
  readonly code: GdlErrorCode;
  readonly userMessage: string;

  constructor(code: GdlErrorCode, detail?: string) {
    super(detail ? `gdl import failed (${code}): ${detail}` : `gdl import failed (${code})`);
    this.name = "GdlError";
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

/** An HTML fragment without its tags, entities decoded, soft hyphens dropped. Spacing is kept: the credits lines are split on it. */
function rawText(html: string): string {
  // An inline tag sits inside a sentence ("<em>purred</em>."), so it leaves no space behind.
  const untagged = html.replace(/<\/?(?:em|strong|b|i|u|s|span|a|sub|sup|small|mark|font)\b[^>]*>/gi, "").replace(/<[^>]*>/g, " ");
  return decodeEntities(untagged).replace(/­/g, "").replace(/ /g, " ");
}

/** Text of an HTML fragment on one line. */
function inlineText(html: string): string {
  return rawText(html).replace(/\s+/g, " ").trim();
}

/** The lines of an HTML fragment, one per paragraph or line break, each still with its own spacing. */
function htmlLines(html: string): string[] {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .split("\n")
    .map(rawText)
    .filter((line) => line.trim() !== "");
}

/**
 * Many GDL books lost their line breaks on the way in ('Puppy saw Kitten,With
 * just a "Miaow",Get fish'), so a closing mark that is glued to the capital
 * letter after it gets the break back. A straight quote between the two goes
 * with the line it belongs to: it opens a quotation when the quotes before it are paired.
 */
function restoreLineBreaks(line: string): string {
  const broken = line.replace(/([a-z]{2}["”’]?[.!?,;:][”’]?)("?)(?=[“‘]?[A-Z])/g, (_whole, head: string, quote: string, offset: number) => {
    if (!quote) return `${head}\n`;
    const before = line.slice(0, offset + head.length).match(/"/g)?.length ?? 0;
    return before % 2 === 0 ? `${head}\n"` : `${head}"\n`;
  });
  // One quotation closing right where the next one opens: 'with us?""Yes, we do!"'.
  return broken.replace(/([.!?,]")(?="[A-Z])/g, "$1\n");
}

/** Story text of one page: a line per paragraph. */
function pageText(html: string): string {
  return htmlLines(html)
    .map((line) => restoreLineBreaks(line.replace(/\s+/g, " ").trim()))
    .join("\n");
}

/**
 * One spelling for a license name. "CC-BY-4.0", "cc-by-4-0", "CC BY 4.0" → "CC BY 4.0";
 * "CC-BY-NC-SA 4.0" → "CC BY-NC-SA 4.0"; "CC0", "PD" → "CC0 1.0". A version that is
 * not given stays out ("CC BY"). Anything else is returned as it came.
 */
export function normalizeGdlLicense(raw: string): string {
  const text = raw.replace(/­/g, "").replace(/\s+/g, " ").trim();
  if (/^(cc[\s-]?0|cc[\s-]zero|cc[\s-]pdm|pd|public domain)\b/i.test(text)) return "CC0 1.0";
  const match = /^cc[\s-]*by((?:[\s-]*(?:nc|nd|sa))*)(?:[\s-]*(\d)[.-](\d))?$/i.exec(text);
  if (!match) return text;
  const flavour = (match[1].match(/nc|nd|sa/gi) ?? []).map((part) => `-${part.toUpperCase()}`).join("");
  return `CC BY${flavour}${match[2] ? ` ${match[2]}.${match[3]}` : ""}`;
}

/** Every license a text names: "Released under CC-BY-NC-4.0", a creativecommons.org link, or the name in words. */
export function gdlLicensesInText(text: string): string[] {
  const clean = text.replace(/­/g, "").replace(/\s+/g, " ");
  const found = new Set<string>();
  for (const match of clean.matchAll(/\bCC[\s-]*BY(?:[\s-]*(?:NC|ND|SA)\b)*(?:[\s-]*\d\.\d)?/gi)) found.add(normalizeGdlLicense(match[0]));
  for (const match of clean.matchAll(/creativecommons\.org\/licenses\/(by(?:-(?:nc|nd|sa))*)\/(\d\.\d)/gi)) {
    found.add(normalizeGdlLicense(`CC ${match[1]} ${match[2]}`));
  }
  const words = /Creative Commons Attribution((?:[\s-]*(?:Non[\s-]?Commercial|No[\s-]?Deriv(?:ative)?s|Share[\s-]?Alike))*)(?:\s*(\d\.\d))?/gi;
  for (const match of clean.matchAll(words)) {
    const flavour = [/non[\s-]?commercial/i, /no[\s-]?deriv/i, /share[\s-]?alike/i]
      .map((part, i) => (part.test(match[1]) ? ["-NC", "-ND", "-SA"][i] : ""))
      .join("");
    found.add(`CC BY${flavour}${match[2] ? ` ${match[2]}` : ""}`);
  }
  if (/\bCC[\s-]?0\b|creativecommons\.org\/publicdomain\/zero/i.test(clean)) found.add("CC0 1.0");
  // Some books listed as CC BY in the catalogue carry their printed copyright page unchanged.
  if (/all rights reserved/i.test(clean)) found.add("All rights reserved");
  return [...found];
}

/** True for a license this importer accepts. A "CC BY" without a version only agrees with one; it is never enough alone. */
function isImportableLicense(license: string, allowVersionless = false): boolean {
  return GDL.licenses.includes(license) || (allowVersionless && license === "CC BY");
}

export interface GdlPage {
  /** "images/<file>" inside the book's folder. Undefined for a page without a picture. */
  imagePath?: string;
  /** Description of the illustration, when GDL has one. */
  imageAlt?: string;
  text: string;
}

export interface ParsedGdlBook {
  title: string;
  description: string;
  coverImagePath?: string;
  /** Publisher named by the credits page ("Published by ...") or else by the cover. Empty when neither names one. */
  publisher: string;
  /** The publisher's address, when the credits page gives it. */
  publisherUrl?: string;
  /** People named with a role on the book's own pages. Empty when the pages do not say. */
  author: string;
  illustrator: string;
  translator: string;
  editor: string;
  /** Names the H5P cover lists that the pages do not confirm in a role (see the file comment). */
  creators: string;
  pages: GdlPage[];
  /** Licenses the pages state in words, e.g. ["CC BY 4.0"]. Empty when the book states none. */
  statedLicenses: string[];
  /** Distinct licenses of the items inside the book (H5P metadata), without the "undisclosed" ones. */
  itemLicenses: string[];
  /** The credits and copyright sentences of the book, in its own wording. */
  attribution: string;
  /** Set when the cover or the credits pages name a publisher of GDL_SKIPPED_PUBLISHERS. */
  skippedPublisher?: string;
  warnings: string[];
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

interface Chapter {
  images: { path: string; alt: string }[];
  /** The text items of the page, as HTML. */
  blocks: string[];
}

/** License of one H5P item from its metadata; "" for "U" (undisclosed) and for none. */
function itemLicense(metadata: Record<string, unknown>): string {
  const license = text(metadata.license);
  if (!license || license === "U") return "";
  return normalizeGdlLicense(/\d/.test(license) ? license : `${license} ${text(metadata.licenseVersion)}`);
}

const LOGO = /\blogos?\b|\bscreenshot\b|\blicen[sc]e\b|letsread_asf/i;
const CREDITS =
  /brought to you by|released under|some rights reserved|all rights reserved|creative\s*commons|©|\(c\)\s*\d{4}|original story|story attribution|for full terms of use|made possible (?:by|through)|published by|is an initiative of|^\s*(?:comprehension\s+)?questions(?![a-z])|^\s*wonderful words|^\s*more about\b|^\s*about the (?:author|illustrator)/i;
const ROLE =
  /\b(Author|Illustrator|Translator|Photographer|Editor)s?\s*:\s*(.*?)(?=\.\s{2,}|\.?\s*(?:\b(?:Author|Illustrator|Translator|Photographer|Editor)s?\s*:|Published by\b|©|$))/gi;
/** What GDL printed where a book has no publisher address. */
const NO_URL = "#_url_#";

function sameWords(a: string, b: string): boolean {
  const key = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return key(a) !== "" && key(a) === key(b);
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s:,.]+|[\s,.;:]+$/g, "");
}

/**
 * Parses the answer of content-api/v1/h5p/<id>: { id, title, params }, where
 * `params` is the H5P parameters of the book as a JSON string.
 */
export function parseGdlBook(body: unknown): ParsedGdlBook {
  const warnings: string[] = [];
  let params: Record<string, unknown>;
  try {
    const raw = record(body).params;
    params = record(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    throw new GdlError("invalid-book", "the book parameters are not JSON");
  }
  const chaptersIn = list(params.chapters);
  if (chaptersIn.length === 0) throw new GdlError("invalid-book", "the book holds no pages");

  const cover = record(params.bookCover);
  const title = inlineText(text(record(body).title)) || "";
  const coverImagePath = text(record(cover.coverImage).path);
  const itemLicenses = new Set<string>();
  const coverLicense = record(record(cover.coverImage).copyright);
  const coverItemLicense = itemLicense({ license: coverLicense.license, licenseVersion: coverLicense.version ?? coverLicense.licenseVersion });
  if (coverItemLicense) itemLicenses.add(coverItemLicense);

  // 1. Every page as its pictures and its text items.
  const chapters: Chapter[] = chaptersIn.map((chapterIn) => {
    const chapter: Chapter = { images: [], blocks: [] };
    for (const itemIn of list(record(record(chapterIn).params).content)) {
      const item = record(record(itemIn).content);
      const itemParams = record(item.params);
      const license = itemLicense(record(item.metadata));
      if (license) itemLicenses.add(license);
      const library = text(item.library);
      if (library.startsWith("H5P.Image ")) {
        const path = text(record(itemParams.file).path);
        if (path) chapter.images.push({ path, alt: inlineText(text(itemParams.alt)) });
      } else if (typeof itemParams.text === "string") {
        if (inlineText(itemParams.text)) chapter.blocks.push(itemParams.text);
      } else if (library) {
        warnings.push(`an item of type ${library.split(" ")[0]} was left out`);
      }
    }
    return chapter;
  });

  // 2. Story pages. The title page and the logo and credits pages around the story are dropped;
  //    the first credits page after the story began ends it.
  const pages: GdlPage[] = [];
  const matter: Chapter[] = [];
  let ended = false;
  for (const chapter of chapters) {
    const words = chapter.blocks.map(inlineText);
    const logos = chapter.images.length > 0 && chapter.images.every((image) => LOGO.test(image.alt) || LOGO.test(image.path));
    const credits = logos || words.some((block) => CREDITS.test(block));
    const titlePage =
      pages.length === 0 &&
      (chapter.images.some((image) => image.path === coverImagePath) || (words.length > 0 && sameWords(words[0], title)));
    if (ended || credits || titlePage) {
      matter.push(chapter);
      if (pages.length > 0) ended = true;
      continue;
    }
    if (chapter.images.length === 0 && words.length === 0) continue;
    const image = chapter.images[0];
    if (chapter.images.length > 1) warnings.push(`page ${pages.length + 1} has ${chapter.images.length} pictures; only the first is kept`);
    // A text item of dots only ("..") is a placeholder under a picture, not text.
    const page: GdlPage = { text: chapter.blocks.map(pageText).filter((block) => /[\p{L}\p{N}]/u.test(block)).join("\n") };
    if (!image && !page.text) continue;
    if (image) {
      page.imagePath = image.path;
      if (image.alt && !sameWords(image.alt, title)) page.imageAlt = image.alt;
    }
    pages.push(page);
  }

  // 3. Credits, from the pages that were dropped.
  const matterLines = matter.flatMap((chapter) => chapter.blocks.flatMap(htmlLines));
  const roles: Record<string, string> = {};
  for (const line of matterLines) {
    for (const match of line.matchAll(ROLE)) {
      const role = match[1].toLowerCase();
      const name = cleanName(match[2]);
      if (name && !roles[role]) roles[role] = name;
    }
  }
  let publisher = "";
  let publisherUrl: string | undefined;
  for (const line of matterLines) {
    const match = /Published by\s+(.+?)[,\s]\s*(https?:\/\/[^\s<>"']+|#_url_#)/i.exec(line) ?? /Published by\s+([^,©]+?)\s*(?:[,©]|\.\s|$)/i.exec(line);
    if (!match || !cleanName(match[1])) continue;
    publisher = cleanName(match[1]);
    if (match[2] && match[2] !== NO_URL) publisherUrl = match[2].replace(/[.,;)]+$/, "");
    break;
  }
  const coverPublisher = cleanName(inlineText(text(cover.publisher)));
  if (!publisher) publisher = coverPublisher;

  const confirmed = Object.values(roles).join(" ").toLowerCase();
  const creators = list(cover.contributors)
    .map((person) => cleanName(inlineText(text(record(person).name))))
    .filter((name, i, all) => name && all.indexOf(name) === i && !confirmed.includes(name.toLowerCase()))
    .join(", ");

  const attribution = matterLines
    .map((line) => line.replace(NO_URL, "").replace(/\s+/g, " ").trim())
    .filter((line) => /©|released under|rights reserved|licen[sc]ed|original story|modified version/i.test(line))
    .filter((line, i, all) => all.indexOf(line) === i)
    .join(" ");

  const everything = chapters.flatMap((chapter) => chapter.blocks.map(inlineText)).join("\n");
  const matterText = matter.flatMap((chapter) => [...chapter.blocks.map(inlineText), ...chapter.images.map((image) => image.alt)]).join("\n");
  const skippedPublisher = gdlSkippedPublisher(`${coverPublisher}\n${publisher}\n${matterText}`);

  if (!title) warnings.push("the book has no title");
  if (!roles.author) warnings.push("the pages name no author");
  if (!roles.illustrator && !roles.photographer) warnings.push("the pages name no illustrator");
  if (creators) warnings.push(`the cover lists ${creators} without a role the pages confirm`);
  pages.forEach((page, i) => {
    if (page.imagePath && !page.text) warnings.push(`page ${i + 1} has a picture but no text`);
    if (!page.imagePath && page.text) warnings.push(`page ${i + 1} has text but no picture`);
  });

  return {
    title,
    description: htmlLines(text(cover.coverDescription))
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n"),
    ...(coverImagePath ? { coverImagePath } : {}),
    publisher,
    ...(publisherUrl ? { publisherUrl } : {}),
    author: roles.author ?? "",
    illustrator: roles.illustrator ?? roles.photographer ?? "",
    translator: roles.translator ?? "",
    editor: roles.editor ?? "",
    creators,
    pages,
    statedLicenses: gdlLicensesInText(everything),
    itemLicenses: [...itemLicenses],
    attribution,
    ...(skippedPublisher ? { skippedPublisher } : {}),
    warnings,
  };
}

export interface GdlCatalogueEntry {
  /** The H5P id: the number every other endpoint takes. */
  id: string;
  title: string;
  description: string;
  /** GDL's own slug of the book page, e.g. "peters-peanuts-2". */
  slug: string;
  /** The book's page on GDL. */
  url: string;
  /** License in the catalogue, normalized ("CC BY 4.0"). Empty when the catalogue names none or several. */
  license: string;
  /** Publisher in the catalogue; empty for most books (the book itself names it). */
  publisher: string;
  /** H5P content type, e.g. "H5P.InteractiveBookSimple". */
  library: string;
  /** Reading levels among the book's topics, e.g. ["Level 1"]. */
  levels: string[];
}

function termNames(value: unknown): string[] {
  return list(value)
    .map((term) => text(record(term).name))
    .filter(Boolean);
}

/** Parses the answer of content-api/v1/books/<language>: { books: [...] }. Entries without an H5P id are left out. */
export function parseGdlCatalogue(body: unknown): GdlCatalogueEntry[] {
  const entries: GdlCatalogueEntry[] = [];
  const seen = new Set<string>();
  for (const itemIn of list(record(body).books)) {
    const item = record(itemIn);
    const id = text(item.h5pId);
    if (!GDL_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const licenses = termNames(item.license).map(normalizeGdlLicense);
    const url = text(item.postLink);
    entries.push({
      id,
      title: inlineText(text(item.title)) || id,
      description: inlineText(text(item.description)),
      slug: text(item.post_name),
      url: /^https:\/\/content\.digitallibrary\.io\/[^\s"'<>]*$/.test(url) ? url : "",
      license: licenses.length === 1 ? licenses[0] : "",
      publisher: inlineText(text(item.publisher)),
      library: text(record(item.h5pLibrary).name),
      levels: termNames(item.topic).filter((name) => /^(Level \d|Emergent Readers)$/i.test(name)),
    });
  }
  return entries;
}

/**
 * Why a catalogue entry is not worth downloading, or undefined when it may be
 * importable. The book itself is still checked by importGdlBook.
 */
export function gdlCatalogueProblem(entry: GdlCatalogueEntry): string | undefined {
  if (entry.library !== GDL.library) return `not a picture book (${entry.library || "no content"})`;
  if (!isImportableLicense(entry.license)) return `license ${entry.license || "unknown"}`;
  const skipped = gdlSkippedPublisher(entry.publisher);
  if (skipped) return `publisher ${skipped}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface GdlClientOptions {
  /** Defaults to the global fetch. Tests pass a stub, so they never touch the network. */
  fetch?: FetchLike;
}

export class GdlClient {
  private readonly fetchImpl: FetchLike;
  private readonly catalogues = new Map<string, Promise<GdlCatalogueEntry[]>>();

  constructor(options: GdlClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
  }

  private async request(url: string, headers: Record<string, string> = {}) {
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { "User-Agent": "mystory-gdl-importer", ...headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new GdlError("network", `${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (response.status === 404) throw new GdlError("not-found", url);
    if (response.status === 429) throw new GdlError("rate-limited", url);
    if (!response.ok) throw new GdlError("network", `${url}: HTTP ${response.status}`);
    return response;
  }

  /** A JSON answer. GDL answers an unknown book with 200 and an empty body: that is "not-found". */
  private async json(url: string, maxBytes: number): Promise<Record<string, unknown>> {
    const response = await this.request(url, { Accept: "application/json" });
    const body = await response.text();
    if (body.length > maxBytes) throw new GdlError("invalid-book", `${url} is too large`);
    if (body.trim() === "" || body.trim() === "null") throw new GdlError("not-found", url);
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // falls through
    }
    throw new GdlError("invalid-book", `${url} did not answer with JSON`);
  }

  /** Every book of one language (a GDL language code), in catalogue order. Fetched once per client. */
  catalogue(language: string = GDL.language): Promise<GdlCatalogueEntry[]> {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) return Promise.reject(new GdlError("invalid-id", `language ${language}`));
    let known = this.catalogues.get(language);
    if (!known) {
      known = this.json(`${GDL.apiBase}/books/${language}`, MAX_CATALOGUE_BYTES).then(parseGdlCatalogue);
      known.catch(() => this.catalogues.delete(language));
      this.catalogues.set(language, known);
    }
    return known;
  }

  /** The catalogue entry of one book: its license, its page on GDL and its reading level. */
  async entry(id: string, language: string = GDL.language): Promise<GdlCatalogueEntry> {
    const found = (await this.catalogue(language)).find((entry) => entry.id === id);
    if (!found) throw new GdlError("not-found", `${id} is not in the ${language} catalogue`);
    return found;
  }

  /** The pages of one book (see parseGdlBook). */
  async book(id: string): Promise<ParsedGdlBook> {
    if (!GDL_ID.test(id)) throw new GdlError("invalid-id", id);
    return parseGdlBook(await this.json(`${GDL.apiBase}/h5p/${id}`, MAX_BOOK_BYTES));
  }

  /** One illustration of a book, checked to come from the book's own folder on GDL and to really be an image. */
  async image(id: string, path: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!GDL_ID.test(id) || !IMAGE_PATH.test(path) || path.includes("..")) throw new GdlError("media", `unsafe image path ${path}`);
    const url = `${GDL.mediaBase}/${id}/images/${encodeURIComponent(path.slice("images/".length))}`;
    let response;
    try {
      response = await this.request(url);
    } catch (err) {
      if (err instanceof GdlError && err.code === "not-found") throw new GdlError("media", `${url} is missing`);
      throw err;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMPORT_LIMITS.imageBytes) throw new GdlError("media", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new GdlError("media", `${url} is too large`);
    const contentType = detectImageType(bytes);
    if (!contentType || contentType === "image/svg+xml") throw new GdlError("media", `${url} is not an image`);
    return { bytes, contentType };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface GdlImportOptions {
  /** The H5P id of the book, e.g. "14051". */
  id: string;
  ownerId: string;
  repo: Repository;
  media: MediaStore;
  client?: GdlClient;
  /** Replace an existing copy (its text, translation, narration and media are deleted). Default false. */
  force?: boolean;
  /** Import a book of a publisher in GDL_SKIPPED_PUBLISHERS anyway. Default false: it is refused. */
  includeSkippedPublishers?: boolean;
  /** Called before each download, for progress output. */
  onProgress?: (message: string) => void;
}

export interface GdlImportResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
  /** Parser and download notes for a person to review. Empty for a skipped book. */
  warnings: string[];
}

/** The local copy of a GDL book, if it was imported before. */
export async function findGdlBook(repo: Repository, id: string): Promise<BookWithPages | null> {
  if (!GDL_ID.test(id)) return null;
  return repo.getBookById(gdlBookId(id));
}

/** GDL reading levels ("Emergent Readers", "Level 1" to "Level 5") mapped to this site's age groups. */
function ageGroupFor(levels: string[], textChars: number): AgeGroup {
  if (levels.some((level) => /^(Emergent Readers|Level 1)$/i.test(level))) return "3-5";
  if (levels.length > 0) return "6-8";
  return textChars < 1200 ? "3-5" : "6-8";
}

function cut(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The license to store, or a GdlError when the catalogue, the items of the
 * book and its credits page do not all say CC BY 4.0 or CC0 (see the file comment).
 */
function agreedLicense(id: string, catalogueLicense: string, parsed: ParsedGdlBook): string {
  if (!isImportableLicense(catalogueLicense)) throw new GdlError("license", `${id}: the catalogue says ${catalogueLicense || "nothing"}`);
  for (const license of parsed.statedLicenses) {
    if (!isImportableLicense(license, true)) throw new GdlError("license", `${id}: the book itself says ${license} (the catalogue says ${catalogueLicense})`);
  }
  for (const license of parsed.itemLicenses) {
    if (!isImportableLicense(license, true)) throw new GdlError("license", `${id}: a picture or text of the book is under ${license}`);
  }
  if (!parsed.statedLicenses.some((license) => isImportableLicense(license))) {
    throw new GdlError("license", `${id}: the book itself states no license, and the catalogue's ${catalogueLicense} alone is not trusted`);
  }
  // CC0 only when nothing asks for attribution.
  const all = [catalogueLicense, ...parsed.statedLicenses, ...parsed.itemLicenses];
  const license = all.every((value) => value === "CC0 1.0") ? "CC0 1.0" : "CC BY 4.0";
  if (!getCcLicense(license)?.allowsAdaptation) throw new GdlError("license", `${id}: ${license}`);
  return license;
}

/**
 * Downloads one book and creates a DRAFT in English: text = originalText =
 * the English text, language 'en', until someone translates it. Idempotent:
 * a book that was imported before is returned untouched unless `force`.
 */
export async function importGdlBook(options: GdlImportOptions): Promise<GdlImportResult> {
  const { id, repo, media } = options;
  if (!GDL_ID.test(id)) throw new GdlError("invalid-id", id);
  const client = options.client ?? new GdlClient();
  const say = options.onProgress ?? (() => undefined);
  const bookId = gdlBookId(id);

  const existing = await repo.getBookById(bookId);
  if (existing && !options.force) return { status: "skipped", book: existing, warnings: [] };
  if (existing?.status === "published") {
    throw new GdlError("invalid-book", `${id} is published; move it back to private before replacing it`);
  }

  // 1. Text and metadata. Nothing is stored until everything was downloaded and checked.
  say("catalogue");
  const entry = await client.entry(id);
  if (entry.library !== GDL.library) throw new GdlError("invalid-book", `${id} is not a picture book (${entry.library || "no content"})`);
  if (!isImportableLicense(entry.license)) throw new GdlError("license", `${id}: the catalogue says ${entry.license || "nothing"}`);
  const skipped = gdlSkippedPublisher(entry.publisher);
  if (skipped && !options.includeSkippedPublishers) throw new GdlError("publisher", `${id}: ${skipped}`);
  say("book");
  const parsed = await client.book(id);
  const warnings = [...parsed.warnings];
  if (parsed.skippedPublisher && !options.includeSkippedPublishers) throw new GdlError("publisher", `${id}: ${parsed.skippedPublisher}`);
  const license = agreedLicense(id, entry.license, parsed);

  if (parsed.pages.length === 0) throw new GdlError("invalid-book", `${id} has no story pages`);
  // Pictures without text next to them: a wordless book, or one whose words are painted into the pictures.
  const withText = parsed.pages.filter((page) => page.text !== "").length;
  const pictureOnly = parsed.pages.filter((page) => page.imagePath && page.text === "").length;
  if (withText === 0 || pictureOnly > withText) throw new GdlError("no-text", `${id}: ${pictureOnly} of ${parsed.pages.length} pages are a picture without text`);
  if (parsed.pages.length > BOOK_LIMITS.pages) throw new GdlError("invalid-book", `${id} has too many pages`);
  for (const page of parsed.pages) {
    if (page.text.length > BOOK_LIMITS.pageTextChars) throw new GdlError("invalid-book", `${id}: a page is too long`);
  }
  const title = parsed.title || entry.title;

  // 2. Images. The same illustration may serve several pages; it is stored once.
  const files = new Map<string, { path: string; bytes: Uint8Array; contentType: string }>();
  const download = async (imagePath: string, storedBase: string): Promise<string> => {
    const known = files.get(imagePath);
    if (known) return known.path;
    say(imagePath);
    const image = await client.image(id, imagePath);
    const path = bookMediaPath(bookId, `${storedBase}.${extensionForContentType(image.contentType)}`);
    files.set(imagePath, { path, ...image });
    return path;
  };

  const pages: Page[] = [];
  for (const [i, source] of parsed.pages.entries()) {
    const page: Page = { index: i, text: source.text };
    if (source.text) page.originalText = source.text;
    if (source.imageAlt) page.imageAlt = cut(source.imageAlt, 1000);
    if (source.imagePath) page.image = await download(source.imagePath, `page-${String(i + 1).padStart(2, "0")}`);
    pages.push(page);
  }
  let coverImage = pages.find((page) => page.image)?.image ?? "";
  if (parsed.coverImagePath) {
    try {
      coverImage = await download(parsed.coverImagePath, "cover");
    } catch (err) {
      if (!(err instanceof GdlError) || err.code !== "media") throw err;
      warnings.push(`the cover could not be downloaded: ${err.message}`);
    }
  }

  if (!parsed.publisher) warnings.push("the book names no publisher: Global Digital Library is credited");
  const credits: BookCredits = {
    publisher: cut(parsed.publisher || GDL.name, 200),
    // The publisher's own address when the credits page gives it; otherwise the library the book was taken from.
    publisherUrl: cut(parsed.publisherUrl ?? GDL.url, 500),
    ...(parsed.attribution ? { attributionLine: cut(parsed.attribution, 500) } : {}),
    originalTitle: cut(title, 200),
    ...(parsed.translator ? { translator: cut(parsed.translator, 200) } : {}),
    ...(parsed.editor ? { editor: cut(parsed.editor, 200) } : {}),
    ...(parsed.creators ? { creators: cut(parsed.creators, 300) } : {}),
  };
  const slug = `gdl-${entry.slug}`;

  // 3. Store. A replaced book loses its old files first; a failure rolls the new ones back.
  if (existing) {
    await repo.deleteBook(bookId);
    await media.deletePrefix(bookMediaPrefix(bookId));
  }
  try {
    for (const file of files.values()) await media.put(file.path, file.bytes, file.contentType);
    const book = await repo.createBook({
      id: bookId,
      slug: SLUG_PATTERN.test(slug) && slug.length <= 80 ? slug : bookId,
      ownerId: options.ownerId,
      status: "draft",
      origin: "import",
      title: cut(title, 200),
      summary: cut(parsed.description || entry.description, 2000),
      // Only what the book's own pages say (see the file comment); never a guess.
      author: cut(parsed.author, 200),
      illustrator: cut(parsed.illustrator, 200),
      license,
      source: entry.url || GDL.url,
      ageGroup: ageGroupFor(entry.levels, pages.reduce((sum, page) => sum + page.text.length, 0)),
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
