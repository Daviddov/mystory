/**
 * Project Gutenberg importer: illustrated children's picture books that are in the public domain.
 *
 * Project Gutenberg (https://www.gutenberg.org) keeps, for every ebook number <n>:
 *
 *   /cache/epub/<n>/pg<n>.rdf              title, creators with birth and death years, rights
 *   /cache/epub/<n>/pg<n>-images.html      the whole book as one HTML page (what /ebooks/<n>.html.images redirects to)
 *   /cache/epub/<n>/images/<file>          its illustrations (a few old ebooks use another folder name)
 *
 * Robots: Project Gutenberg forbids crawling its site. This importer never reads a
 * catalogue, a search page or a bookshelf: it fetches the files of ONE ebook that was
 * asked for by its number (the rdf, the HTML, its pictures), one request after the
 * other, with a pause between them. The candidates are listed by hand in
 * GUTENBERG_BOOKS. An answer of 403 or 429, or a "you have been blocked" page, is the
 * error "blocked": the caller stops; nothing here retries or works around it.
 *
 * Copyright: Project Gutenberg checks the copyright of the USA only. This site is
 * Israeli, where copyright lasts 70 years after the death of the creator, to the end
 * of that year. A book is therefore REFUSED (error "license") unless the rdf says
 * "Public domain in the USA." AND every creator it lists (author, illustrator,
 * translator, editor) died in GUTENBERG.latestDeathYear or earlier. A creator whose
 * death year is unknown is refused. The one exception is written down per book: an
 * anonymous work whose first publication before 1900 was checked by hand
 * (GutenbergBookHints.anonymousPublished).
 *
 * The Project Gutenberg name is a trademark and its license text is its own: the
 * header, the footer, the license and every paragraph that names Project Gutenberg
 * are left out of the imported text, and no logo is stored. The source is credited
 * plainly: Book.source is the ebook's address and credits.attributionLine names the
 * ebook number. credits.publisher is the ORIGINAL publisher of the printed book, and
 * only when the book states one (recorded by hand in GUTENBERG_BOOKS).
 *
 * Pages: a Gutenberg book is one long HTML page, not a list of pages. The story is cut
 * into pages at its illustrations, and whether a picture belongs to the text before it
 * or after it differs from edition to edition: see GutenbergPairing. That, the place
 * where the story begins, and the pictures to leave out were decided per book by
 * looking at the book, and are recorded in GUTENBERG_BOOKS. Old picture books whose
 * story is lettered inside the pictures (page scans) are not importable and are not on
 * the list: nothing here can detect them.
 *
 * No "server-only" import and no getRepo(): the CLI (scripts/import-gutenberg.ts)
 * runs this under tsx. All network access goes through an injectable fetch.
 */
import { estimateReadingMinutes } from "../hebrew";
import { BOOK_LIMITS } from "../limits";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { Repository } from "../repo/types";
import { SLUG_PATTERN, type AgeGroup, type BookCredits, type BookWithPages, type Page } from "../types";
import type { FetchLike } from "./bookdash";
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GUTENBERG = {
  name: "Project Gutenberg",
  url: "https://www.gutenberg.org",
  /** The only place anything is downloaded from; "/<n>/pg<n>.rdf", "/<n>/pg<n>-images.html" and "/<n>/<picture>" follow. */
  cacheBase: "https://www.gutenberg.org/cache/epub",
  /** Stored in Book.license. Not a Creative Commons license: nothing forbids a translation. */
  license: "Public domain",
  /** The only rights statement of the rdf that is accepted. */
  rights: "Public domain in the USA.",
  /**
   * Israel: 70 years after the creator's death, to the end of that year. A creator who
   * died in 1955 is free since 1 January 2026. Raise this by hand, a year at a time.
   */
  latestDeathYear: 1955,
  /** Fewer illustrated pages than this is a text with a few plates, not a picture book. */
  minIllustratedPages: 6,
  /** Who is asking, for Project Gutenberg's logs. */
  userAgent: "mystory-gutenberg-importer (children's library; fetches single ebooks asked for by number, never crawls)",
} as const;

const MAX_RDF_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
/** Pause between two requests of the same book. The CLI adds a longer one between books. */
const REQUEST_PAUSE_MS = 250;
/** Project Gutenberg addresses a book by its ebook number. */
const GUTENBERG_ID = /^[1-9]\d{0,6}$/;
/** An illustration inside the book's folder: "images/<file>" (a few ebooks use another folder, or one inside it), nothing that could leave it. */
const IMAGE_PATH = /^(?:[A-Za-z0-9][A-Za-z0-9_-]{0,40}\/){0,2}[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(?:jpe?g|png|gif|webp)$/i;

/** Stable id of the local copy of a Gutenberg ebook: one copy per site, found again by its number. */
export function gutenbergBookId(id: string): string {
  return `gutenberg-${GUTENBERG_ID.test(id) ? id : "0"}`;
}

/** The ebook's page on Project Gutenberg; stored in Book.source. */
export function gutenbergSourceUrl(id: string): string {
  return `${GUTENBERG.url}/ebooks/${id}`;
}

export type GutenbergErrorCode =
  | "invalid-id"
  | "not-found"
  | "blocked"
  | "network"
  | "invalid-book"
  | "no-text"
  | "license"
  | "media";

const USER_MESSAGES: Record<GutenbergErrorCode, string> = {
  "invalid-id": "מספר הספר במאגר אינו תקין.",
  "not-found": "הספר לא נמצא במאגר של Project Gutenberg, או שאין לו מהדורה עם איורים.",
  blocked: "Project Gutenberg חסם את הבקשות. אין לנסות שוב עד שהעניין יתברר.",
  network: "לא הצלחנו להתחבר למאגר של Project Gutenberg. בדקו את החיבור ונסו שוב.",
  "invalid-book": "הספר אינו ספר תמונות במבנה שאפשר לייבא: מעט מדי איורים, יותר מדי עמודים או טקסט ארוך מדי.",
  "no-text": "הטקסט של הספר הזה נמצא בתוך האיורים או שאין בו טקסט, ולכן אי אפשר לייבא אותו.",
  license: "אי אפשר לאמת שהספר נמצא בנחלת הכלל גם בישראל (70 שנה ממות כל היוצרים), ולכן הוא לא יובא.",
  media: "אחת התמונות של הספר חסרה, גדולה מדי או אינה תמונה תקינה.",
};

/** A refused or failed import. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class GutenbergError extends Error {
  readonly code: GutenbergErrorCode;
  readonly userMessage: string;

  constructor(code: GutenbergErrorCode, detail?: string) {
    super(detail ? `gutenberg import failed (${code}): ${detail}` : `gutenberg import failed (${code})`);
    this.name = "GutenbergError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

// ---------------------------------------------------------------------------
// The curated list
// ---------------------------------------------------------------------------

/**
 * How the pictures of an edition go with its text:
 *
 *   "after"   picture, then its text. Text before the first picture joins the first page.
 *   "before"  text, then its picture. Text after the last picture joins the last page.
 *   "spread"  the HTML follows the printed spreads (picture, text | text, picture | ...):
 *             text between two pictures is shared between them, the first half of its
 *             paragraphs to the picture before it and the rest to the one after it (or
 *             cut at the paragraph the edition quotes as the caption of the next
 *             picture). A picture that already has text takes no more.
 */
export type GutenbergPairing = "after" | "before" | "spread";

/** What a person decided by looking at one book. Everything is optional; the defaults are a guess. */
export interface GutenbergBookHints {
  pairing?: GutenbergPairing;
  /**
   * Where the story begins: an image path ("images/08.jpg") or the first words of a
   * paragraph. Everything before it is the title page, the copyright page, a dedication.
   * Default: the first paragraph that reads like a sentence, with a picture right before it.
   */
  start?: string;
  /** The first thing AFTER the story: an image path or the first words of a paragraph. Default: "THE END", or the end of the book. */
  end?: string;
  /** The picture to use as the cover (an image path). Default: the book's own cover file, else the first picture before the story. */
  cover?: string;
  /** Pictures inside the story to leave out: ornaments, tailpieces, a repeated title. */
  skip?: readonly string[];
  /** Pictures to leave out wherever they stand, as a regular expression on the image path ("^images/line_"). */
  skipPattern?: string;
  /**
   * "spread" only, where the halving is wrong: for a picture, how many paragraphs of
   * the text right before it belong to the picture before it.
   */
  spreadCuts?: Readonly<Record<string, number>>;
  /** Captions are the story text of this book, not a description of the picture. Default false. */
  captionsAreText?: boolean;
  /** Line breaks inside a paragraph are only how the printed line was set, not verse: join the lines. Default false. */
  joinLines?: boolean;
  /** Author as the title page names them, when the rdf lists nobody as the author. */
  author?: string;
  /** Illustrator as the title page names them, when the rdf lists none (Beatrix Potter drew her own books). */
  illustrator?: string;
  /**
   * People the title page names and the rdf does not, with the year they died. They are
   * checked exactly like the rdf's creators.
   */
  creators?: readonly { name: string; died: number }[];
  /**
   * Death years the rdf does not know, looked up by hand, for creators it does list
   * (by their name in reading order). Negative is BCE: Aesop is { Aesop: -564 }.
   */
  deathYears?: Readonly<Record<string, number>>;
  /** The publisher printed on the title page, e.g. "Frederick Warne & Co.". Omitted when the book states none. */
  publisher?: string;
  /**
   * The documented exception of the license rule: the year an ANONYMOUS work was first
   * published, checked by hand. Only a year before 1900 lets an "Anonymous" creator through.
   */
  anonymousPublished?: number;
  ageGroup?: AgeGroup;
  /**
   * The ebook is a collection of short stories, each under its own <h2> heading, and
   * every story becomes a book of its own (importGutenbergCollection). The pairing,
   * start, end and spread hints above do not apply to a collection.
   */
  collection?: GutenbergCollectionHints;
}

export interface GutenbergCollectionHints {
  /** The heading of the first story, as printed ("THE WOLF AND THE KID"). Headings before it are the front matter. */
  first: string;
  /** Headings of stories to leave out, as printed. A story without a picture is always left out. */
  skip?: readonly string[];
  /** Category slugs every book of the collection gets. */
  categories?: readonly string[];
}

export interface GutenbergCuratedBook extends GutenbergBookHints {
  /** The ebook number. */
  id: string;
  title: string;
}

const POTTER = { illustrator: "Beatrix Potter" } as const;
const WARNE = "Frederick Warne & Co.";

/**
 * The books that were looked at, one by one, and found importable: the story is text
 * of its own next to the pictures (not lettered inside them), and every creator died
 * in 1955 or earlier. This is the whole "catalogue" of this importer.
 *
 * Looked at and left OUT, so that nobody adds them without a reason:
 *   67144 The Hole Book (Newell): two plates are racist caricature.
 *   18735 The Little Red Hen (Williams), 25877 The Little Gingerbread Man: the first letter of
 *         paragraphs is a picture without alt text, so the text arrives damaged.
 *   12109 The House That Jack Built and the other Caldecott picture books: most plates have no text.
 *   15661 The Golden Goose Book, 23462 More Russian Picture Tales, 36664 / 13004 Goops: several
 *         stories or far more than 60 pictures in one ebook.
 *   27530 The Tailor and the Crow, 23322 The Three Bears, 31342 The 3 Little Kittens, 23350 Cecily
 *         Parsley's Nursery Rhymes: verse that lives on its English rhyme; the middle two are also anonymous.
 *   25650 All About the Little Small Red Hen: anonymous, first published 1917.
 *   17782 Animal Children: the illustrator's death year is unknown. 14304 Peter Rabbit illustrated
 *         by Virginia Albert: she died in 1967. Everything by Thornton Burgess: he died in 1965.
 *   19805 Mr. Tod, 48420 Three Little Kittens (Pyle), 44629 The Seashore Book: long prose with plates.
 *   Little Black Sambo and its like: not wanted.
 */
export const GUTENBERG_BOOKS: readonly GutenbergCuratedBook[] = [
  { id: "14838", title: "The Tale of Peter Rabbit", ...POTTER, publisher: WARNE, pairing: "after", start: "Once upon a time there were four little Rabbits", cover: "images/peter04.jpg" },
  { id: "14848", title: "The Story of Miss Moppet", ...POTTER, publisher: WARNE, pairing: "spread", joinLines: true, start: "images/m10.jpg", cover: "images/m06.jpg" },
  { id: "14407", title: "The Tale of Benjamin Bunny", ...POTTER, publisher: WARNE, pairing: "after", start: "images/08.jpg", cover: "images/04.jpg" },
  { id: "14872", title: "The Tale of Squirrel Nutkin", ...POTTER, publisher: WARNE, pairing: "after", start: "images/8.jpg", cover: "images/4.jpg" },
  { id: "14814", title: "The Tale of Jemima Puddle-Duck", ...POTTER, publisher: WARNE, pairing: "after", start: "images/8.jpg" },
  { id: "14837", title: "The Tale of Tom Kitten", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/tom08.jpg" },
  { id: "14868", title: "The Tailor of Gloucester", ...POTTER, publisher: WARNE, pairing: "after", start: "In the time of swords and periwigs", cover: "images/4.jpg" },
  { id: "15077", title: "The Tale of Mr. Jeremy Fisher", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/jf04.jpg" },
  { id: "15137", title: "The Tale of Mrs. Tiggy-Winkle", ...POTTER, publisher: WARNE, pairing: "after", start: "images/8.jpg" },
  { id: "14220", title: "The Tale of the Flopsy Bunnies", ...POTTER, publisher: WARNE, pairing: "after", start: "images/image004.jpg", end: "images/image030.jpg" },
  { id: "45264", title: "The Tale of Two Bad Mice", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/illus19.jpg" },
  { id: "17089", title: "The Tale of Mrs. Tittlemouse", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/08.jpg" },
  { id: "15575", title: "The Tale of Samuel Whiskers; Or, The Roly-Poly Pudding", ...POTTER, publisher: WARNE, pairing: "after", start: "images/pic13.gif", end: "images/inside03.jpg", cover: "images/pic08.jpg" },
  { id: "15284", title: "The Tale of Johnny Town-Mouse", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/town02.jpg" },
  { id: "14797", title: "The Tale of Timmy Tiptoes", ...POTTER, publisher: WARNE, pairing: "after", start: "images/8.jpg", cover: "images/4.jpg" },
  { id: "14877", title: "The Tale of Ginger and Pickles", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/grayp11.png", spreadCuts: { "images/grayp24.png": 2, "images/grayp26.png": 3 } },
  { id: "45265", title: "The Story of a Fierce Bad Rabbit", ...POTTER, publisher: WARNE, pairing: "spread", start: "images/i008.jpg", end: "PRINTED FOR THE PUBLISHERS" },
  // The title page says "With drawings by L. Leslie Brooke": the tale itself is traditional and names no author.
  { id: "18155", title: "The Story of the Three Little Pigs", author: "", illustrator: "L. Leslie Brooke", publisher: WARNE, pairing: "after", start: "Once upon a time there was an old Sow", end: "images/imgback-cover.jpg" },
  { id: "10469", title: "Johnny Crow's Garden", illustrator: "L. Leslie Brooke", pairing: "before", start: "Johnny Crow", end: "BOOKS" },
  { id: "10557", title: "Johnny Crow's Party", illustrator: "L. Leslie Brooke", pairing: "after", start: "jcparty/006.jpg", end: "OTHER BOOKS WITH", skip: ["jcparty/endpapers.jpg"] },
  { id: "15234", title: "The Tale of the Pie and the Patty-Pan", ...POTTER, publisher: WARNE, pairing: "after", start: "images/pie11.gif", end: "images/piecover.jpg", cover: "images/piecover.jpg" },
  { id: "17254", title: "The Slant Book", illustrator: "Peter Newell", publisher: "Harper & Brothers", pairing: "before", start: "Where Bobby lives there is a hill", cover: "images/cover.jpg" },
  { id: "17104", title: "The Rocket Book", illustrator: "Peter Newell", publisher: "Harper & Brothers", pairing: "before", start: "THE BASEMENT", end: "[Blank Page]", skipPattern: "^images/hole\\d" },
  { id: "29980", title: "The Cock, the Mouse and the Little Red Hen", publisher: "Macrae Smith Company", pairing: "after", joinLines: true, start: "Once upon a time there was a hill", end: "Thumbnails", skipPattern: "^images/line_" },
  { id: "56270", title: "The Story of Noah's Ark", illustrator: "E. Boyd Smith", publisher: "Houghton Mifflin Company", pairing: "after", start: "images/pl_001_lg.jpg", ageGroup: "6-8" },
  // A collection: one book per illustrated fable. Milo Winter died in 1956, so the license
  // check refuses it until GUTENBERG.latestDeathYear is raised to 1956 (1 January 2027).
  // Left out: fables whose story turns on a Greek or Roman god, or a satyr.
  {
    id: "19994",
    title: "The Aesop for Children",
    publisher: "Rand McNally & Company",
    // The retellings are unsigned; the 1919 edition is long out of copyright as an anonymous work.
    deathYears: { Aesop: -564 },
    ageGroup: "6-8",
    collection: {
      first: "THE WOLF AND THE KID",
      categories: ["fables", "animals"],
      skip: [
        "THE TORTOISE AND THE DUCKS",
        "THE PLANE TREE",
        "THE FROGS WHO WISHED FOR A KING",
        "THE OWL AND THE GRASSHOPPER",
        "THE PEACOCK",
        "MERCURY AND THE WOODMAN",
        "THE EAGLE AND THE BEETLE",
        "THE ANIMALS AND THE PLAGUE",
        "THE SHEPHERD AND THE LION",
        "THE MAN AND THE SATYR",
      ],
    },
  },
];

/** The curated entry of an ebook number, if it is on the list. */
export function gutenbergCuratedBook(id: string): GutenbergCuratedBook | undefined {
  return GUTENBERG_BOOKS.find((book) => book.id === id);
}

// ---------------------------------------------------------------------------
// Parsing (pure): the rdf
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  aelig: "æ",
  oelig: "œ",
  pound: "£",
  frac12: "½",
  frac14: "¼",
  deg: "°",
  copy: "©",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

export interface GutenbergCreator {
  /** The name in reading order: "Beatrix Potter". */
  name: string;
  /** "author", "illustrator", "translator", "editor", or the MARC relator code of anything else ("ctb"). */
  role: string;
  born?: number;
  /** Undefined when the rdf does not know. */
  died?: number;
}

export interface GutenbergRecord {
  title: string;
  /** What follows the title on its own line in the rdf ("An Old English Folk Tale"). Empty for most books. */
  subtitle: string;
  /** The rights statement, e.g. "Public domain in the USA.". */
  rights: string;
  /** Language codes of the text, e.g. ["en"]. */
  languages: string[];
  creators: GutenbergCreator[];
}

const MARC_ROLES: Record<string, string> = { aut: "author", ill: "illustrator", art: "illustrator", trl: "translator", edt: "editor" };

/** "Potter, Beatrix" → "Beatrix Potter"; "Brooke, L. Leslie (Leonard Leslie)" → "L. Leslie Brooke". Other shapes stay as they are. */
export function gutenbergDisplayName(raw: string): string {
  const name = raw
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = name.split(",").map((part) => part.trim());
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : name;
}

function year(value: string | undefined): number | undefined {
  const match = /^-?\d{1,4}$/.exec((value ?? "").trim());
  return match ? Number(match[0]) : undefined;
}

/** Reads pg<n>.rdf. Not an XML parser: it understands the layout Project Gutenberg writes. */
export function parseGutenbergRdf(rdf: string): GutenbergRecord {
  if (!/<pgterms:ebook\b/.test(rdf)) throw new GutenbergError("invalid-book", "the rdf describes no ebook");
  const field = (name: string): string => {
    const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(rdf);
    return match ? decodeEntities(match[1].replace(/<[^>]*>/g, "")).trim() : "";
  };
  const titleLines = field("dcterms:title")
    // The title and what follows it are separated by a line break, or by the MARC mark " : $b ".
    .split(/\r?\n|\s*:\s*\$b\s*/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const creators: GutenbergCreator[] = [];
  for (const match of rdf.matchAll(/<(dcterms:creator|marcrel:[a-z]{3})>\s*<pgterms:agent\b[^>]*>([\s\S]*?)<\/pgterms:agent>/g)) {
    const inner = (name: string) => new RegExp(`<pgterms:${name}\\b[^>]*>([^<]*)<`).exec(match[2])?.[1];
    const name = gutenbergDisplayName(decodeEntities(inner("name") ?? ""));
    if (!name) continue;
    const code = match[1] === "dcterms:creator" ? "aut" : match[1].slice("marcrel:".length);
    const born = year(inner("birthdate"));
    const died = year(inner("deathdate"));
    creators.push({ name, role: MARC_ROLES[code] ?? code, ...(born !== undefined ? { born } : {}), ...(died !== undefined ? { died } : {}) });
  }

  const languages = [...rdf.matchAll(/<dcterms:language>[\s\S]*?<rdf:value[^>]*>([^<]+)<\/rdf:value>/g)].map((match) => match[1].trim());
  return {
    title: titleLines[0] ?? "",
    subtitle: titleLines.slice(1).join(" "),
    rights: field("dcterms:rights").replace(/\s+/g, " "),
    languages,
    creators,
  };
}

const ANONYMOUS = /^(anonymous|unknown|anon\.?)$/i;

/**
 * Why a book may not be imported under the rule of the file comment, or undefined when
 * it may. `hints` adds the creators a person read off the title page and the documented
 * exception for an old anonymous work.
 */
export function gutenbergLicenseProblem(record: GutenbergRecord, hints: GutenbergBookHints = {}): string | undefined {
  if (record.rights !== GUTENBERG.rights) return `the rdf says "${record.rights || "nothing"}", not "${GUTENBERG.rights}"`;
  const creators: { name: string; died?: number }[] = [...record.creators, ...(hints.creators ?? [])];
  if (creators.length === 0) return "the rdf lists no creator, so nobody's death year can be checked";
  for (const creator of creators) {
    if (ANONYMOUS.test(creator.name) && creator.died === undefined) {
      const published = hints.anonymousPublished;
      if (published === undefined) return `the creator is "${creator.name}": no death year, and no checked publication year before 1900`;
      if (!Number.isInteger(published) || published >= 1900) return `an anonymous work published in ${published}, not before 1900`;
      continue;
    }
    const died = creator.died ?? hints.deathYears?.[creator.name];
    if (died === undefined) return `the death year of ${creator.name} is unknown`;
    if (died > GUTENBERG.latestDeathYear) return `${creator.name} died in ${died}, after ${GUTENBERG.latestDeathYear}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Parsing (pure): the HTML
// ---------------------------------------------------------------------------

export interface GutenbergPage {
  /** Path of the picture inside the book's folder, e.g. "images/peter08.jpg". Undefined for a page of text only. */
  imagePath?: string;
  /** Description or caption of the picture, when the edition wrote a real one. */
  imageAlt?: string;
  /** Story text of the page; paragraphs and verse lines are separated by a newline. */
  text: string;
}

export interface ParsedGutenbergBook {
  /** The title in the HTML's metadata; the rdf is the authority. */
  title: string;
  pages: GutenbergPage[];
  /** The cover or frontispiece, as a path inside the book's folder. */
  coverImagePath?: string;
  /** Things a person should look at (never fatal). */
  warnings: string[];
}

interface ImageItem {
  kind: "image";
  path: string;
  alt: string;
  /** False for a picture whose address is not inside the book's folder. */
  safe: boolean;
}
interface TextItem {
  kind: "text";
  text: string;
}
type Item = ImageItem | TextItem;

const IMAGE_MARK = "\u0001";
const BLOCK_MARK = "\u0002";

function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return decodeEntities(match?.[1] ?? match?.[2] ?? "").trim();
}

/** The book between Project Gutenberg's header and footer. */
function gutenbergBody(html: string): string {
  let body = html.replace(/^[\s\S]*?<body\b[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  // Current files wrap the boilerplate in <header id="pg-header"> and <footer id="pg-footer">.
  body = body.replace(/<(header|section|div)\b[^>]*\bid="pg-header"[\s\S]*?<\/\1>/i, "");
  body = body.replace(/<(footer|section|div)\b[^>]*\bid="pg-footer"[\s\S]*$/i, "");
  // Older ones only have the two "***" lines.
  const start = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i.exec(body);
  if (start) body = body.slice(start.index + start[0].length);
  const end = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i.exec(body);
  if (end) body = body.slice(0, end.index);
  return body;
}

/** Text that is not part of any book: the boilerplate of Project Gutenberg and of the people who made the ebook. */
const BOILERPLATE =
  /project gutenberg|gutenberg\.org|distributed proofread|pgdp\.net|^e-?text prepared by|^produced by|^transcriber'?s? notes?|^\[?transcriber/i;
const THE_END = /^(?:the\s+)?end\.?$/i;
/** "[Illustration]" and "[Illustration: caption]" are how the plain-text edition marks a picture. */
const ILLUSTRATION_MARK = /\[Illustration(?::[^\]]*)?\]/gi;
/** Page numbers of the printed book: "[Pg 12]", "[Page 12]", "{12}". */
const PAGE_NUMBER = /\[(?:Pg|Page)\.?\s*\d*\]|\{\d{1,3}\}/gi;

function cleanLine(line: string): string {
  return line
    .replace(ILLUSTRATION_MARK, " ")
    .replace(PAGE_NUMBER, " ")
    .replace(/[ \s]+/g, " ")
    .trim();
}

/** True for an alt text that describes a picture, not "[Illustration]", "Cover" or a file name. */
function realAlt(alt: string): boolean {
  if (alt.length < 3 || !/[\p{L}]{3}/u.test(alt)) return false;
  if (BOILERPLATE.test(alt)) return false;
  return !/^\[?(?:illustrations?|images?|pictures?|decorat\w*|emblem|frontispiece|cover|front cover|title page|plate \d+)\]?\.?$/i.test(alt) && !/\.(?:jpe?g|png|gif)$/i.test(alt);
}

/** The book as a flat list of pictures and paragraphs, in reading order. */
function gutenbergItems(html: string, hints: GutenbergBookHints, warnings: string[]): Item[] {
  let body = gutenbergBody(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, "")
    // Page numbers of the printed book sit in their own spans.
    .replace(/<(span|a|div|p)\b[^>]*class="[^"]*\b(?:pagenum|pageno|page-?number)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, "");

  // 1. Pictures. A thumbnail that links to the full picture stands for the full picture.
  const images: ImageItem[] = [];
  const mark = (tag: string, linked = "") => {
    const source = /\.(?:jpe?g|png|gif|webp)$/i.test(linked) ? linked : attribute(tag, "src");
    let path = source;
    try {
      path = decodeURIComponent(source);
    } catch {
      // keeps the raw value, which then fails IMAGE_PATH
    }
    images.push({ kind: "image", path, alt: (attribute(tag, "alt") || attribute(tag, "title")).replace(/\s+/g, " "), safe: IMAGE_PATH.test(path) && !path.includes("..") });
    return `${IMAGE_MARK}${images.length - 1}${IMAGE_MARK}`;
  };
  body = body.replace(/<a\b[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, (whole: string, tag: string) => mark(tag, attribute(whole.slice(0, whole.indexOf(">") + 1), "href")));
  // Some editions close the link before the picture: <a href="images/cover.jpg"></a><img src="images/cover-th.jpg">.
  body = body.replace(/(<a\b[^>]*>)\s*<\/a>\s*(<img\b[^>]*>)/gi, (_whole, link: string, tag: string) => mark(tag, attribute(link, "href")));
  body = body.replace(/<img\b[^>]*>/gi, (tag) => mark(tag));

  // 2. Captions describe the picture before them; in a few books they ARE the story.
  if (!hints.captionsAreText) {
    body = body.replace(/<(p|div|span|figcaption)\b[^>]*class="[^"]*\bcaption\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, (whole, _tag, inner: string, offset: number) => {
      const before = body.slice(Math.max(0, offset - 400), offset);
      const index = [...before.matchAll(/\u0001(\d+)\u0001/g)].pop()?.[1];
      const image = index === undefined ? undefined : images[Number(index)];
      if (!image) return whole;
      const caption = cleanLine(decodeEntities(inner.replace(/\u0001\d+\u0001/g, " ").replace(/<[^>]*>/g, " ")));
      if (caption && !realAlt(image.alt)) image.alt = caption;
      return inner.match(/\u0001\d+\u0001/g)?.join("") ?? "";
    });
  }

  // 3. Paragraphs. Block tags end a paragraph, <br> ends a line, every other tag is dropped.
  //    A line break of the HTML source itself means nothing.
  body = body
    .replace(/\s+/g, " ")
    .replace(/<br\s*\/?>/gi, hints.joinLines ? " " : "\n")
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|table|tbody|tr|td|th|hr|pre|center|section|figure|figcaption|dl|dt|dd)\b[^>]*>/gi, BLOCK_MARK)
    .replace(/<[^>]*>/g, "");
  body = decodeEntities(body).replace(/­/g, "");

  const items: Item[] = [];
  for (const block of body.split(BLOCK_MARK)) {
    const pieces = block.split(/\u0001(\d+)\u0001/);
    for (let i = 0; i < pieces.length; i++) {
      if (i % 2 === 1) {
        const image = images[Number(pieces[i])];
        // A decorated initial: the picture of a letter, glued to the rest of its word.
        const next = pieces[i + 1] ?? "";
        if (/^\p{Lu}$/u.test(image.alt) && /^\p{L}/u.test(next)) {
          pieces[i + 1] = image.alt + next;
          continue;
        }
        if (!image.safe) {
          warnings.push(`picture left out, its address is not inside the book's folder: ${image.path.slice(0, 80)}`);
          continue;
        }
        items.push(image);
        continue;
      }
      const lines = (hints.joinLines ? [pieces[i].replace(/\s+/g, " ")] : pieces[i].split("\n")).map(cleanLine).filter(Boolean);
      const text = lines.join("\n");
      if (!text || !/[\p{L}\p{N}]/u.test(text) || BOILERPLATE.test(text)) continue;
      items.push({ kind: "text", text });
    }
  }
  return items;
}

/** Index of the item a hint points at: an image path, or the first words of a paragraph. -1 when nothing matches. */
function findItem(items: Item[], hint: string, from = 0): number {
  const wanted = hint.replace(/\s+/g, " ").trim();
  const asImage = IMAGE_PATH.test(wanted);
  return items.findIndex((item, i) => {
    if (i < from) return false;
    if (item.kind === "image") return asImage && item.path === wanted;
    return !asImage && item.text.replace(/\s+/g, " ").startsWith(wanted);
  });
}

/** A paragraph that reads like the story: a sentence, not a title, an imprint or a copyright line. */
function looksLikeStory(text: string): boolean {
  if (text.length < 40 || !/[a-z]{3}/.test(text) || !/[.!?,;:—]/.test(text)) return false;
  if (text === text.toUpperCase()) return false;
  return !/copyright|all rights reserved|printed (?:and bound )?in|published by|publishers?\b|first (?:published|edition)|author of|illustrat(?:ed|ions) by|dedicated|\bco\.,|\binc\.|\bltd\b|new york|london|chicago|boston|philadelphia/i.test(text);
}

/** True when `part` is nothing but words that `whole` already holds, in the same order. */
function sameWords(whole: string, part: string): boolean {
  const key = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return key(part) !== "" && key(whole).includes(key(part));
}

interface Draft {
  image?: ImageItem;
  paragraphs: string[];
}

function pairAfter(items: Item[]): Draft[] {
  const drafts: Draft[] = [];
  let leading: string[] = [];
  for (const item of items) {
    if (item.kind === "image") {
      drafts.push({ image: item, paragraphs: leading });
      leading = [];
    } else if (drafts.length === 0) leading.push(item.text);
    else drafts[drafts.length - 1].paragraphs.push(item.text);
  }
  if (leading.length > 0) drafts.push({ paragraphs: leading });
  return drafts;
}

function pairBefore(items: Item[]): Draft[] {
  const drafts: Draft[] = [];
  let pending: string[] = [];
  for (const item of items) {
    if (item.kind === "text") pending.push(item.text);
    else {
      drafts.push({ image: item, paragraphs: pending });
      pending = [];
    }
  }
  if (pending.length > 0) {
    const last = drafts[drafts.length - 1];
    if (last) last.paragraphs.push(...pending);
    else drafts.push({ paragraphs: pending });
  }
  return drafts;
}

function pairSpread(items: Item[], cuts: Readonly<Record<string, number>> = {}): Draft[] {
  const drafts: Draft[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind === "image") {
      drafts.push({ image: item, paragraphs: [] });
      i += 1;
      continue;
    }
    const run: string[] = [];
    while (i < items.length && items[i].kind === "text") run.push((items[i++] as TextItem).text);
    const before = drafts[drafts.length - 1];
    const hasNext = i < items.length;
    if (!before) {
      // Text before the first picture belongs to it.
      if (hasNext) {
        drafts.push({ image: items[i++] as ImageItem, paragraphs: run });
      } else drafts.push({ paragraphs: run });
      continue;
    }
    if (!hasNext || before.paragraphs.length > 0) {
      if (hasNext) drafts.push({ image: items[i++] as ImageItem, paragraphs: run });
      else before.paragraphs.push(...run);
      continue;
    }
    // Where the edition captions the next picture with the words of a paragraph, the text is cut there.
    const next = items[i] as ImageItem;
    const captioned = run.findIndex((paragraph) => sameWords(paragraph, next.alt));
    const first = Math.min(run.length, cuts[next.path] ?? (captioned > 0 ? captioned : Math.ceil(run.length / 2)));
    before.paragraphs.push(...run.slice(0, first));
    const rest = run.slice(first);
    if (rest.length > 0) drafts.push({ image: items[i++] as ImageItem, paragraphs: rest });
  }
  return drafts;
}

/** Cuts a text that is too long for one page at its line breaks; a single line that is too long is cut at a sentence. */
function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const units = text.split("\n").flatMap((line) => (line.length <= max ? [line] : (line.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [line]).map((part) => part.trim())));
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    for (let rest = unit; rest; rest = rest.slice(max)) {
      const piece = rest.slice(0, max);
      if (current && current.length + 1 + piece.length > max) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Cuts the HTML edition of one ebook into pages: one illustration with its text each.
 * See GutenbergBookHints for what a person can decide; without hints the story is
 * taken to begin at the first paragraph that reads like a sentence.
 */
export function parseGutenbergHtml(html: string, hints: GutenbergBookHints = {}): ParsedGutenbergBook {
  const warnings: string[] = [];
  const title = cleanLine(decodeEntities(/<meta\s+name="dc\.title"\s+content="([^"]*)"/i.exec(html)?.[1] ?? ""));
  const linkedCover = /<link\b[^>]*type="image\/x-cover"[^>]*>/i.exec(html)?.[0] ?? /<link\b[^>]*rel="icon"[^>]*>/i.exec(html)?.[0] ?? "";
  const items = gutenbergItems(html, hints, warnings);
  if (items.length === 0) throw new GutenbergError("invalid-book", "the HTML holds no book");

  // 1. Where the story begins and ends.
  let start: number;
  if (hints.start) {
    start = findItem(items, hints.start);
    if (start < 0) throw new GutenbergError("invalid-book", `the beginning of the story was not found: "${hints.start}"`);
  } else {
    start = items.findIndex((item) => item.kind === "text" && looksLikeStory(item.text));
    if (start < 0) throw new GutenbergError("no-text", "no paragraph of the book reads like a story");
    // The picture right before the first sentence is its picture, unless the text comes first in this edition.
    if (hints.pairing !== "before") while (start > 0 && items[start - 1].kind === "image") start -= 1;
  }
  let end = items.length;
  if (hints.end) {
    end = findItem(items, hints.end, start);
    if (end < 0) throw new GutenbergError("invalid-book", `the end of the story was not found: "${hints.end}"`);
  } else {
    const theEnd = items.findIndex((item, i) => i > start && item.kind === "text" && THE_END.test(item.text));
    if (theEnd >= 0) end = theEnd;
  }

  const skipped = new Set(hints.skip ?? []);
  const skippedPattern = hints.skipPattern ? new RegExp(hints.skipPattern) : undefined;
  const story = items
    .slice(start, end)
    .filter((item) => (item.kind === "image" ? !skipped.has(item.path) && !skippedPattern?.test(item.path) : !THE_END.test(item.text)));

  // 2. Pages.
  const pairing = hints.pairing ?? "after";
  const drafts = pairing === "before" ? pairBefore(story) : pairing === "spread" ? pairSpread(story, hints.spreadCuts) : pairAfter(story);
  const pages: GutenbergPage[] = [];
  for (const draft of drafts) {
    const chunks = splitLongText(draft.paragraphs.join("\n"), BOOK_LIMITS.pageTextChars);
    if (chunks.length > 1) warnings.push(`the text of page ${pages.length + 1} is too long for one page: it continues on ${chunks.length - 1} page(s) without a picture`);
    // The picture stays next to the text that touches it: the last part when the text comes first.
    const withImage = pairing === "before" ? chunks.length - 1 : 0;
    chunks.forEach((text, i) => {
      const page: GutenbergPage = { text };
      if (draft.image && i === withImage) {
        page.imagePath = draft.image.path;
        // An alt text that only repeats words of the page is not a description.
        if (realAlt(draft.image.alt) && !sameWords(text, draft.image.alt)) page.imageAlt = draft.image.alt;
      }
      pages.push(page);
    });
  }

  // 3. The cover: the one a person chose, the book's own cover file, or the first picture before the story.
  const front = items.slice(0, start).filter((item): item is ImageItem => item.kind === "image");
  const linked = attribute(linkedCover, "href");
  const coverImagePath =
    hints.cover ?? (IMAGE_PATH.test(linked) && !linked.includes("..") ? linked : undefined) ?? front[0]?.path ?? pages.find((page) => page.imagePath)?.imagePath;
  if (hints.cover && (!IMAGE_PATH.test(hints.cover) || hints.cover.includes(".."))) throw new GutenbergError("invalid-book", `unsafe cover path ${hints.cover}`);

  pages.forEach((page, i) => {
    if (page.imagePath && !page.text) warnings.push(`page ${i + 1} has a picture but no text`);
  });
  return { title, pages, ...(coverImagePath ? { coverImagePath } : {}), warnings };
}

export interface ParsedGutenbergStory {
  /** Position of the story among all the headings of the collection, from 1; stable across imports. */
  number: number;
  /** The heading as printed ("THE FOX AND THE GRAPES"). */
  heading: string;
  /** The heading in title case ("The Fox and the Grapes"). */
  title: string;
  pages: GutenbergPage[];
}

export interface ParsedGutenbergCollection {
  stories: ParsedGutenbergStory[];
  warnings: string[];
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "without"]);

/** "THE ASS IN THE LION'S SKIN" → "The Ass in the Lion's Skin". */
export function gutenbergTitleCase(heading: string): string {
  return heading
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/\p{L}/u, (letter) => letter.toUpperCase())))
    .join("");
}

/** Paragraphs per page of a collection story: a short fable reads better over a few pages than on one. */
const STORY_PAGE_CHARS = 500;

function storyPages(heading: string, paragraphs: string[], images: ImageItem[]): GutenbergPage[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.flatMap((text) => splitLongText(text, STORY_PAGE_CHARS))) {
    if (current && current.length + 1 + paragraph.length > STORY_PAGE_CHARS) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  // A one-line ending (the moral) joins the page before it rather than standing alone.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 120 && chunks[chunks.length - 2].length + chunks[chunks.length - 1].length < BOOK_LIMITS.pageTextChars) {
    chunks[chunks.length - 2] += `\n${chunks.pop()}`;
  }
  // Every page shows a picture: the pictures are spread over the pages in their order.
  return chunks.map((text, i) => {
    const image = images[Math.min(images.length - 1, Math.floor((i * images.length) / chunks.length))];
    const page: GutenbergPage = { text, imagePath: image.path };
    // Most pictures of a collection repeat the heading as their alt text: that describes nothing.
    if (realAlt(image.alt) && !sameWords(text, image.alt) && !sameWords(heading, image.alt)) page.imageAlt = image.alt;
    return page;
  });
}

/**
 * Cuts the HTML edition of a collection (see GutenbergCollectionHints) into its
 * stories, one per <h2> heading from `first` on. A story without a picture, or one
 * the hints skip, is left out.
 */
export function parseGutenbergCollection(html: string, hints: GutenbergBookHints & { collection: GutenbergCollectionHints }): ParsedGutenbergCollection {
  const warnings: string[] = [];
  const body = gutenbergBody(html);
  const headings = [...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const heading = (match: RegExpMatchArray) => cleanLine(decodeEntities(match[1].replace(/<[^>]*>/g, " ")));
  const first = headings.findIndex((match) => heading(match) === hints.collection.first);
  if (first < 0) throw new GutenbergError("invalid-book", `the first story was not found: "${hints.collection.first}"`);
  const skipped = new Set(hints.collection.skip ?? []);
  const skippedPattern = hints.skipPattern ? new RegExp(hints.skipPattern) : undefined;

  const stories: ParsedGutenbergStory[] = [];
  for (let i = first; i < headings.length; i++) {
    const printed = heading(headings[i]);
    const from = (headings[i].index ?? 0) + headings[i][0].length;
    const to = i + 1 < headings.length ? headings[i + 1].index : body.length;
    if (skipped.has(printed)) continue;
    const items = gutenbergItems(body.slice(from, to), { ...hints, captionsAreText: false }, warnings).filter(
      (item) => item.kind === "text" || (!hints.skip?.includes(item.path) && !skippedPattern?.test(item.path)),
    );
    const images = items.filter((item): item is ImageItem => item.kind === "image");
    const paragraphs = items.filter((item): item is TextItem => item.kind === "text" && !THE_END.test(item.text)).map((item) => item.text);
    if (images.length === 0) {
      warnings.push(`left out, no picture: ${printed}`);
      continue;
    }
    if (paragraphs.length === 0) {
      warnings.push(`left out, no text: ${printed}`);
      continue;
    }
    stories.push({ number: i - first + 1, heading: printed, title: gutenbergTitleCase(printed), pages: storyPages(printed, paragraphs, images) });
  }
  return { stories, warnings };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface GutenbergClientOptions {
  /** Defaults to the global fetch. Tests pass a stub, so they never touch the network. */
  fetch?: FetchLike;
  /** Pause between two requests, in milliseconds. Default 250; tests pass 0. */
  pauseMs?: number;
}

/** What Project Gutenberg answers, with status 200 or not, to a client it has shut out. */
const BLOCKED_PAGE = /you have been blocked|your ip address has been (?:temporarily )?blocked|automated (?:access|queries)|captcha/i;

/**
 * Reads the files of single ebooks. Every request is made one after the other
 * with a pause; there is no method that lists or searches anything.
 */
export class GutenbergClient {
  private readonly fetchImpl: FetchLike;
  private readonly pauseMs: number;
  private last = 0;

  constructor(options: GutenbergClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.pauseMs = options.pauseMs ?? REQUEST_PAUSE_MS;
  }

  private async request(url: string) {
    const wait = this.last + this.pauseMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { "User-Agent": GUTENBERG.userAgent },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new GutenbergError("network", `${url}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.last = Date.now();
    }
    if (response.status === 403 || response.status === 429) throw new GutenbergError("blocked", `${url}: HTTP ${response.status}`);
    if (response.status === 404) throw new GutenbergError("not-found", url);
    if (!response.ok) throw new GutenbergError("network", `${url}: HTTP ${response.status}`);
    return response;
  }

  private async text(url: string, maxBytes: number): Promise<string> {
    const response = await this.request(url);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw new GutenbergError("invalid-book", `${url} is too large`);
    const body = await response.text();
    if (body.length > maxBytes) throw new GutenbergError("invalid-book", `${url} is too large`);
    // The real files are long; a short page that talks about blocking is the refusal itself.
    if (body.length < 20_000 && BLOCKED_PAGE.test(body) && !/<pgterms:ebook\b|id="pg-header"/.test(body)) throw new GutenbergError("blocked", `${url} answered with a "blocked" page`);
    return body;
  }

  /** Title, rights and creators of one ebook (see parseGutenbergRdf). */
  async record(id: string): Promise<GutenbergRecord> {
    if (!GUTENBERG_ID.test(id)) throw new GutenbergError("invalid-id", id);
    return parseGutenbergRdf(await this.text(`${GUTENBERG.cacheBase}/${id}/pg${id}.rdf`, MAX_RDF_BYTES));
  }

  /** The HTML edition with images of one ebook, unparsed. */
  async html(id: string): Promise<string> {
    if (!GUTENBERG_ID.test(id)) throw new GutenbergError("invalid-id", id);
    return this.text(`${GUTENBERG.cacheBase}/${id}/pg${id}-images.html`, MAX_HTML_BYTES);
  }

  /** One illustration of a book, checked to come from the book's own folder and to really be an image. */
  async image(id: string, path: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!GUTENBERG_ID.test(id) || !IMAGE_PATH.test(path) || path.includes("..")) throw new GutenbergError("media", `unsafe image path ${path}`);
    const url = `${GUTENBERG.cacheBase}/${id}/${path}`;
    let response;
    try {
      response = await this.request(url);
    } catch (err) {
      if (err instanceof GutenbergError && err.code === "not-found") throw new GutenbergError("media", `${url} is missing`);
      throw err;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMPORT_LIMITS.imageBytes) throw new GutenbergError("media", `${url} is too large`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new GutenbergError("media", `${url} is too large`);
    const contentType = detectImageType(bytes);
    if (!contentType || contentType === "image/svg+xml") throw new GutenbergError("media", `${url} is not an image`);
    return { bytes, contentType };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface GutenbergImportOptions {
  /** The ebook number, e.g. "14838". */
  id: string;
  ownerId: string;
  repo: Repository;
  media: MediaStore;
  client?: GutenbergClient;
  /** Replace an existing copy (its text, translation, narration and media are deleted). Default false. */
  force?: boolean;
  /** What a person decided about this book. Default: its entry in GUTENBERG_BOOKS, if it has one. */
  hints?: GutenbergBookHints;
  /** Called before each download, for progress output. */
  onProgress?: (message: string) => void;
}

export interface GutenbergImportResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
  /** Parser and download notes for a person to review. Empty for a skipped book. */
  warnings: string[];
}

/** The local copy of a Gutenberg ebook, if it was imported before. */
export async function findGutenbergBook(repo: Repository, id: string): Promise<BookWithPages | null> {
  if (!GUTENBERG_ID.test(id)) return null;
  return repo.getBookById(gutenbergBookId(id));
}

function cut(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** "The Tale of Peter Rabbit" → "gutenberg-the-tale-of-peter-rabbit"; the book id when the title leaves nothing usable. */
export function gutenbergSlug(id: string, title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = `gutenberg-${words}`.slice(0, 80).replace(/-+$/, "");
  return words && SLUG_PATTERN.test(slug) ? slug : gutenbergBookId(id);
}

function names(creators: GutenbergCreator[], role: string): string {
  return creators
    .filter((creator) => creator.role === role && !ANONYMOUS.test(creator.name))
    .map((creator) => creator.name)
    .filter((name, i, all) => all.indexOf(name) === i)
    .join(", ");
}

/**
 * Downloads one ebook and creates a DRAFT in English: text = originalText =
 * the English text, language 'en', until someone translates it. Idempotent:
 * a book that was imported before is returned untouched unless `force`.
 */
export async function importGutenbergBook(options: GutenbergImportOptions): Promise<GutenbergImportResult> {
  const { id, repo, media } = options;
  if (!GUTENBERG_ID.test(id)) throw new GutenbergError("invalid-id", id);
  const client = options.client ?? new GutenbergClient();
  const say = options.onProgress ?? (() => undefined);
  const bookId = gutenbergBookId(id);
  const curated = gutenbergCuratedBook(id);
  const hints: GutenbergBookHints = options.hints ?? curated ?? {};

  const existing = await repo.getBookById(bookId);
  if (existing && !options.force) return { status: "skipped", book: existing, warnings: [] };
  if (existing?.status === "published") {
    throw new GutenbergError("invalid-book", `${id} is published; move it back to private before replacing it`);
  }

  // 1. Rights first: a book that may not be used is refused before its text is even fetched.
  say(`pg${id}.rdf`);
  const record = await client.record(id);
  const problem = gutenbergLicenseProblem(record, hints);
  if (problem) throw new GutenbergError("license", `${id}: ${problem}`);
  if (!record.languages.includes("en")) throw new GutenbergError("invalid-book", `${id} is not in English (${record.languages.join(", ") || "no language"})`);

  // 2. Text. Nothing is stored until everything was downloaded and checked.
  say(`pg${id}-images.html`);
  const parsed = parseGutenbergHtml(await client.html(id), hints);
  const warnings = [...parsed.warnings];
  if (!options.hints && !curated) warnings.push("this ebook is not on the curated list: nobody checked that its pictures hold no text and that picture and text match");

  const illustrated = parsed.pages.filter((page) => page.imagePath).length;
  const withText = parsed.pages.filter((page) => page.text !== "").length;
  const pictureOnly = parsed.pages.filter((page) => page.imagePath && page.text === "").length;
  // Pictures without text next to them: a wordless book, or one whose words are lettered into the pictures.
  if (withText === 0 || pictureOnly > withText) throw new GutenbergError("no-text", `${id}: ${pictureOnly} of ${parsed.pages.length} pages are a picture without text`);
  if (illustrated < GUTENBERG.minIllustratedPages) throw new GutenbergError("invalid-book", `${id} has ${illustrated} illustrated pages: not a picture book`);
  if (parsed.pages.length - illustrated > illustrated) {
    throw new GutenbergError("invalid-book", `${id}: ${parsed.pages.length - illustrated} of ${parsed.pages.length} pages have no picture: prose with plates, not a picture book`);
  }
  if (parsed.pages.length > BOOK_LIMITS.pages) throw new GutenbergError("invalid-book", `${id} has too many pages (${parsed.pages.length})`);
  for (const page of parsed.pages) {
    if (page.text.length > BOOK_LIMITS.pageTextChars) throw new GutenbergError("invalid-book", `${id}: a page is too long`);
  }
  // The rdf writes some titles in lower case; the curated list has them as the title page does.
  const title = curated?.title || record.title || parsed.title;
  if (!title) throw new GutenbergError("invalid-book", `${id} has no title`);

  // 3. Images. The same illustration may serve several pages; it is stored once.
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
      if (!(err instanceof GutenbergError) || err.code !== "media") throw err;
      warnings.push(`the cover could not be downloaded: ${err.message}`);
    }
  }

  const author = hints.author ?? names(record.creators, "author");
  const illustrator = hints.illustrator ?? names(record.creators, "illustrator");
  const translator = names(record.creators, "translator");
  const editor = names(record.creators, "editor");
  if (!author) warnings.push("the rdf names no author");
  if (!illustrator) warnings.push("the rdf names no illustrator");
  const credits: BookCredits = {
    // Only the publisher the printed book states; Project Gutenberg digitized it and is named in the attribution.
    ...(hints.publisher ? { publisher: cut(hints.publisher, 200) } : {}),
    attributionLine: `Digitized text and illustrations from Project Gutenberg ebook #${id} (public domain).`,
    originalTitle: cut(title, 200),
    ...(translator ? { translator: cut(translator, 200) } : {}),
    ...(editor ? { editor: cut(editor, 200) } : {}),
  };
  const textChars = pages.reduce((sum, page) => sum + page.text.length, 0);

  // 4. Store. A replaced book loses its old files first; a failure rolls the new ones back.
  if (existing) {
    await repo.deleteBook(bookId);
    await media.deletePrefix(bookMediaPrefix(bookId));
  }
  try {
    for (const file of files.values()) await media.put(file.path, file.bytes, file.contentType);
    const book = await repo.createBook({
      id: bookId,
      slug: gutenbergSlug(id, title),
      ownerId: options.ownerId,
      status: "draft",
      origin: "import",
      title: cut(title, 200),
      summary: cut(record.subtitle, 2000),
      author: cut(author, 200),
      illustrator: cut(illustrator, 200),
      license: GUTENBERG.license,
      source: gutenbergSourceUrl(id),
      ageGroup: hints.ageGroup ?? (textChars > 6000 ? "6-8" : "3-5"),
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

export interface GutenbergCollectionStoryResult {
  status: "created" | "replaced" | "skipped";
  book: BookWithPages;
}

export interface GutenbergCollectionImportResult {
  stories: GutenbergCollectionStoryResult[];
  /** Parser and download notes for a person to review. */
  warnings: string[];
}

/** Stable id of one story of a collection: "gutenberg-19994-012" for its 12th heading. */
export function gutenbergStoryId(id: string, number: number): string {
  return `${gutenbergBookId(id)}-${String(number).padStart(3, "0")}`;
}

/**
 * Downloads a collection (an ebook whose curated entry has `collection`) and creates
 * one English DRAFT per story, with the same rules as importGutenbergBook: rights
 * first, nothing stored before the story's pictures were downloaded and checked, and
 * a story that was imported before is left untouched unless `force`.
 */
export async function importGutenbergCollection(options: GutenbergImportOptions): Promise<GutenbergCollectionImportResult> {
  const { id, repo, media } = options;
  if (!GUTENBERG_ID.test(id)) throw new GutenbergError("invalid-id", id);
  const client = options.client ?? new GutenbergClient();
  const say = options.onProgress ?? (() => undefined);
  const curated = gutenbergCuratedBook(id);
  const hints: GutenbergBookHints = options.hints ?? curated ?? {};
  const collection = hints.collection;
  if (!collection) throw new GutenbergError("invalid-book", `${id} is not a collection`);

  say(`pg${id}.rdf`);
  const record = await client.record(id);
  const problem = gutenbergLicenseProblem(record, hints);
  if (problem) throw new GutenbergError("license", `${id}: ${problem}`);
  if (!record.languages.includes("en")) throw new GutenbergError("invalid-book", `${id} is not in English (${record.languages.join(", ") || "no language"})`);

  say(`pg${id}-images.html`);
  const parsed = parseGutenbergCollection(await client.html(id), { ...hints, collection });
  if (parsed.stories.length === 0) throw new GutenbergError("invalid-book", `${id}: no story of the collection has a picture`);
  const warnings = [...parsed.warnings];

  const collectionTitle = curated?.title || record.title;
  const author = hints.author ?? names(record.creators, "author");
  const illustrator = hints.illustrator ?? names(record.creators, "illustrator");
  const translator = names(record.creators, "translator");
  const editor = names(record.creators, "editor");

  const stories: GutenbergCollectionStoryResult[] = [];
  for (const story of parsed.stories) {
    const bookId = gutenbergStoryId(id, story.number);
    const existing = await repo.getBookById(bookId);
    if (existing && !options.force) {
      stories.push({ status: "skipped", book: existing });
      continue;
    }
    if (existing?.status === "published") {
      warnings.push(`${bookId} is published and was not replaced; move it back to private first`);
      stories.push({ status: "skipped", book: existing });
      continue;
    }

    const files = new Map<string, { path: string; bytes: Uint8Array; contentType: string }>();
    const pages: Page[] = [];
    for (const [i, source] of story.pages.entries()) {
      const page: Page = { index: i, text: source.text, originalText: source.text };
      if (source.imageAlt) page.imageAlt = cut(source.imageAlt, 1000);
      if (source.imagePath) {
        let file = files.get(source.imagePath);
        if (!file) {
          say(source.imagePath);
          const image = await client.image(id, source.imagePath);
          file = { path: bookMediaPath(bookId, `picture-${files.size + 1}.${extensionForContentType(image.contentType)}`), ...image };
          files.set(source.imagePath, file);
        }
        page.image = file.path;
      }
      pages.push(page);
    }
    const credits: BookCredits = {
      ...(hints.publisher ? { publisher: cut(hints.publisher, 200) } : {}),
      attributionLine: `Text and illustrations from "${collectionTitle}", Project Gutenberg ebook #${id} (public domain).`,
      originalTitle: cut(story.title, 200),
      ...(translator ? { translator: cut(translator, 200) } : {}),
      ...(editor ? { editor: cut(editor, 200) } : {}),
    };

    if (existing) {
      await repo.deleteBook(bookId);
      await media.deletePrefix(bookMediaPrefix(bookId));
    }
    try {
      for (const file of files.values()) await media.put(file.path, file.bytes, file.contentType);
      const book = await repo.createBook({
        id: bookId,
        slug: gutenbergSlug(id, story.title),
        ownerId: options.ownerId,
        status: "draft",
        origin: "import",
        title: cut(story.title, 200),
        summary: "",
        author: cut(author, 200),
        illustrator: cut(illustrator, 200),
        license: GUTENBERG.license,
        source: gutenbergSourceUrl(id),
        ageGroup: hints.ageGroup ?? "3-5",
        language: "en",
        originalLanguage: "en",
        categories: [...(collection.categories ?? [])],
        credits,
        coverImage: pages[0].image ?? "",
        readingMinutes: estimateReadingMinutes(pages.map((page) => page.text)),
        pages,
      });
      stories.push({ status: existing ? "replaced" : "created", book });
    } catch (err) {
      await media.deletePrefix(bookMediaPrefix(bookId)).catch(() => undefined);
      throw err;
    }
  }
  return { stories, warnings };
}
