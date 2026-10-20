/**
 * Landing pages for the weekly Torah portion and the Jewish holidays: one page
 * per parasha (/parasha/noach) and per holiday (/holidays/hanukkah), built for
 * how parents search ("סיפור לפרשת נח לילדים", "סיפור לחנוכה לילדים").
 *
 * A book belongs to an occasion through its tags: the original parasha stories
 * carry "פרשת נח", holiday stories carry "חנוכה" or "ט״ו בשבט". Tags are
 * compared without nikud, gershayim and dashes ("ט״ו בשבט" = "טו בשבט"). A holiday also takes the books of
 * collections whose season key is the holiday's slug.
 *
 * Pure and client-safe.
 */
import { PARASHA_SEEDS, TORAH_BOOKS, type TorahBook } from "./generation/parasha";
import { normalizeForSearch } from "./hebrew";
import { routes } from "./routes";

export type OccasionKind = "parasha" | "holiday";

export interface Occasion {
  kind: OccasionKind;
  /** URL segment. Holidays use the season keys of collections (components/library/seasons.ts). */
  slug: string;
  /** Name as people write it, no nikud: "נח", "ט״ו בשבט". */
  name: string;
  emoji: string;
  /** Tags that put a book on this page. */
  tags: readonly string[];
  /** Parashot only: the book of the Torah. */
  book?: TorahBook;
  /** Holidays only: one sentence for the intro. */
  blurb?: string;
}

/** Parashot whose tag differs from the calendar name. */
const PARASHA_EXTRA_TAGS: Record<string, string[]> = {
  shelach: ["פרשת שלח"],
  tetzaveh: ["פרשת תצווה"],
  bechukotai: ["פרשת בחקתי", "פרשת בחוקתי"],
  "acharei-mot": ["פרשת אחרי"],
  korach: ["פרשת קרח"],
  chukat: ["פרשת חקת"],
};

export const PARASHOT: readonly Occasion[] = PARASHA_SEEDS.map((seed) => ({
  kind: "parasha",
  slug: seed.slug,
  name: seed.name,
  emoji: "📜",
  book: seed.book,
  tags: [`פרשת ${seed.name}`, ...(PARASHA_EXTRA_TAGS[seed.slug] ?? [])],
}));

export const HOLIDAYS: readonly Occasion[] = [
  {
    kind: "holiday",
    slug: "shabbat",
    name: "שבת",
    emoji: "🕯️",
    tags: ["שבת", "שבת קודש", "ערב שבת"],
    blurb: "סיפורים לקריאה בשולחן השבת ולפני השינה בליל שבת.",
  },
  {
    kind: "holiday",
    slug: "rosh-hashana",
    name: "ראש השנה",
    emoji: "🍎",
    tags: ["ראש השנה", "שופר"],
    blurb: "תפוח בדבש, תקיעת שופר והתחלה חדשה.",
  },
  {
    kind: "holiday",
    slug: "yom-kippur",
    name: "יום כיפור",
    emoji: "🤍",
    tags: ["יום כיפור", "יום הכיפורים"],
    blurb: "סיפורים על סליחה, על התנצלות ועל לב טוב.",
  },
  {
    kind: "holiday",
    slug: "sukkot",
    name: "סוכות",
    emoji: "🌿",
    tags: ["סוכות", "חג הסוכות", "סוכה", "ארבעת המינים"],
    blurb: "בונים סוכה, מקשטים אותה ומזמינים אורחים.",
  },
  {
    kind: "holiday",
    slug: "simchat-torah",
    name: "שמחת תורה",
    emoji: "📖",
    tags: ["שמחת תורה", "הקפות"],
    blurb: "מסיימים את התורה, מתחילים מבראשית ורוקדים עם ספר התורה.",
  },
  {
    kind: "holiday",
    slug: "hanukkah",
    name: "חנוכה",
    emoji: "🕎",
    tags: ["חנוכה", "נרות חנוכה", "חנוכייה", "חנוכיה", "המכבים"],
    blurb: "נרות, סביבונים, לביבות ונס פך השמן.",
  },
  {
    kind: "holiday",
    slug: "tu-bishvat",
    name: "ט״ו בשבט",
    emoji: "🌳",
    tags: ["ט״ו בשבט", "ראש השנה לאילנות"],
    blurb: "ראש השנה לאילנות: נטיעות, עצים ופירות הארץ.",
  },
  {
    kind: "holiday",
    slug: "purim",
    name: "פורים",
    emoji: "🎭",
    tags: ["פורים", "מגילת אסתר", "משלוח מנות"],
    blurb: "מגילת אסתר, תחפושות ומשלוחי מנות.",
  },
  {
    kind: "holiday",
    slug: "pesach",
    name: "פסח",
    emoji: "🍷",
    tags: ["פסח", "חג הפסח", "ליל הסדר", "הגדה של פסח", "מצה"],
    blurb: "יציאת מצרים, ליל הסדר ומצות.",
  },
  {
    kind: "holiday",
    slug: "lag-baomer",
    name: "ל״ג בעומר",
    emoji: "🔥",
    tags: ["ל״ג בעומר"],
    blurb: "מדורות, חצים וקשת ושמחה בין פסח לשבועות.",
  },
  {
    kind: "holiday",
    slug: "shavuot",
    name: "שבועות",
    emoji: "🌾",
    tags: ["שבועות", "חג השבועות", "מתן תורה", "ביכורים"],
    blurb: "מתן תורה, ביכורים וקציר החיטים.",
  },
];

export const OCCASIONS: readonly Occasion[] = [...PARASHOT, ...HOLIDAYS];

export function getOccasion(kind: OccasionKind, slug: string): Occasion | undefined {
  return (kind === "parasha" ? PARASHOT : HOLIDAYS).find((occasion) => occasion.slug === slug);
}

/** The parashot grouped by the books of the Torah, in the order of the cycle. */
export function parashotByBook(): { book: TorahBook; label: string; parashot: Occasion[] }[] {
  return (Object.keys(TORAH_BOOKS) as TorahBook[]).map((book) => ({
    book,
    label: TORAH_BOOKS[book],
    parashot: PARASHOT.filter((parasha) => parasha.book === book),
  }));
}

export function occasionHref(occasion: Occasion): string {
  return occasion.kind === "parasha" ? routes.parasha(occasion.slug) : routes.holiday(occasion.slug);
}

/** The name with its prefix, as in a search: "פרשת נח", "חנוכה". */
export function occasionLabel(occasion: Occasion): string {
  return occasion.kind === "parasha" ? `פרשת ${occasion.name}` : occasion.name;
}

/** Page title as parents search for it, no nikud: "סיפור לפרשת נח לילדים", "סיפורים לחנוכה לילדים". */
export function occasionSearchTitle(occasion: Occasion): string {
  return occasion.kind === "parasha"
    ? `סיפור לפרשת ${occasion.name} לילדים`
    : `סיפורים ל${occasion.name} לילדים`;
}

/** Meta description: what the page offers, in the words people search with. */
export function occasionDescription(occasion: Occasion): string {
  if (occasion.kind === "parasha") {
    const book = occasion.book ? ` (ספר ${TORAH_BOOKS[occasion.book]})` : "";
    return `סיפורים מאוירים לילדים על פרשת ${occasion.name}${book}: לקריאה ולהאזנה לפני שבת, עם ניקוד, הקראה ושאלות לשיחה בשולחן השבת. בחינם.`;
  }
  return `סיפורים מאוירים לילדים ל${occasion.name}: ${occasion.blurb ?? ""} לקריאה ולהאזנה אונליין, עם ניקוד והקראה. בחינם.`
    .replace(/\s+/g, " ")
    .trim();
}

/** Short intro shown under the page title. */
export function occasionIntro(occasion: Occasion): string {
  if (occasion.kind === "parasha") {
    const book = occasion.book ? `בספר ${TORAH_BOOKS[occasion.book]}` : "בתורה";
    return `פרשת ${occasion.name} היא אחת מפרשות השבוע ${book}. כאן תמצאו סיפורים לילדים שמספרים את הפרשה בשפה פשוטה, עם איורים, ניקוד והקראה, ושאלות קטנות לשיחה בשולחן השבת.`;
  }
  return `${occasion.blurb ?? ""} סיפורים לילדים לקראת ${occasion.name} ובמהלכו, עם איורים, ניקוד והקראה.`.trim();
}

/** Comparison key of a tag: gershayim and quotes dropped (ט״ו = טו), then normalizeForSearch(). */
function tagKey(tag: string): string {
  return normalizeForSearch(tag.replace(/["'`׳״“”]/g, ""));
}

const normalizedTags = new Map<string, Set<string>>();

function occasionKey(occasion: Occasion): string {
  return `${occasion.kind}:${occasion.slug}`;
}

function tagsOf(occasion: Occasion): Set<string> {
  const key = occasionKey(occasion);
  let tags = normalizedTags.get(key);
  if (!tags) {
    tags = new Set(occasion.tags.map(tagKey));
    normalizedTags.set(key, tags);
  }
  return tags;
}

/** Whether a book's tags put it on the occasion's page. */
export function bookMatchesOccasion(book: { tags: readonly string[] }, occasion: Occasion): boolean {
  const tags = tagsOf(occasion);
  return book.tags.some((tag) => tags.has(tagKey(tag)));
}

/**
 * Ids of the books of each occasion, keyed "parasha:noach" / "holiday:hanukkah".
 * `collections` adds the books of a collection whose season is a holiday's slug.
 */
export function groupBooksByOccasion(
  books: readonly { id: string; tags: readonly string[] }[],
  collections: readonly { season?: string; bookIds: readonly string[] }[] = [],
): Map<string, string[]> {
  const known = new Set(books.map((book) => book.id));
  const result = new Map<string, string[]>();
  for (const occasion of OCCASIONS) {
    const ids = new Set(books.filter((book) => bookMatchesOccasion(book, occasion)).map((book) => book.id));
    if (occasion.kind === "holiday") {
      for (const collection of collections) {
        if (collection.season?.trim().toLowerCase() !== occasion.slug) continue;
        for (const id of collection.bookIds) if (known.has(id)) ids.add(id);
      }
    }
    result.set(occasionKey(occasion), [...ids]);
  }
  return result;
}

export function occasionBookIds(grouped: Map<string, string[]>, occasion: Occasion): string[] {
  return grouped.get(occasionKey(occasion)) ?? [];
}

/** Search engines index an occasion page only once it has a book; an empty page is thin content. */
export function occasionIndexable(bookCount: number): boolean {
  return bookCount > 0;
}
