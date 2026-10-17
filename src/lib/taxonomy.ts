/**
 * Fixed taxonomy: categories, age groups, reading-time buckets, discussion
 * themes and a starter tag list. Safe to import from client components.
 */
import type { AgeGroup } from "./types";

export interface TaxonomyItem {
  slug: string;
  label: string;
  emoji: string;
  description?: string;
  /** Page title as parents search for it (no nikud), e.g. "סיפורי חיות לילדים". Default: built from the label. */
  searchTitle?: string;
}

// --- Categories -------------------------------------------------------------

export const CATEGORIES = [
  { slug: "adventures", searchTitle: "סיפורי הרפתקאות לילדים", label: "הרפתקאות", emoji: "🗺️", description: "מסעות, תעלומות וגילויים" },
  { slug: "bedtime", searchTitle: "סיפורים לפני השינה לילדים", label: "לפני השינה", emoji: "🌙", description: "סיפורים רגועים לסוף היום" },
  { slug: "animals", searchTitle: "סיפורי חיות לילדים", label: "חיות", emoji: "🦊", description: "חברים על ארבע, בכנפיים ובסנפירים" },
  { slug: "fantasy", searchTitle: "סיפורי פנטזיה וקסמים לילדים", label: "פנטזיה", emoji: "🦄", description: "קסמים, דרקונים ועולמות דמיוניים" },
  { slug: "educational", searchTitle: "ספרים לימודיים לילדים", label: "לימודי", emoji: "🔤", description: "אותיות, מספרים, צבעים וידע" },
  { slug: "home-education", searchTitle: "סיפורים על הרגלים ושגרה לילדים", label: "חינוך ביתי", emoji: "🏡", description: "הרגלים, שגרה ועצמאות בבית" },
  { slug: "transitions", searchTitle: "סיפורים על מעברים: גן חדש, אח חדש", label: "מעברים", emoji: "🎒", description: "גן חדש, אח חדש, דירה חדשה" },
  { slug: "overcoming", searchTitle: "סיפורים על התגברות על פחדים לילדים", label: "התגברות", emoji: "💪", description: "פחדים, קשיים וניצחונות קטנים" },
  { slug: "friendship", searchTitle: "סיפורים על חברות לילדים", label: "חברות", emoji: "🤝", description: "חברים, משפחה ולהיות ביחד" },
  { slug: "nature", searchTitle: "סיפורים על הטבע לילדים", label: "טבע", emoji: "🌳", description: "עונות, צמחים, ים ושמיים" },
  { slug: "humor", searchTitle: "סיפורים מצחיקים לילדים", label: "הומור", emoji: "😄", description: "סיפורים מצחיקים ושטותיים" },
  { slug: "values", searchTitle: "סיפורים עם ערכים לילדים", label: "ערכים", emoji: "💛", description: "כנות, נתינה, סבלנות וכבוד" },
  { slug: "fables", searchTitle: "משלים לילדים עם מוסר השכל", label: "משלים", emoji: "🦉", description: "סיפורי חיות עם מוסר השכל" },
  { slug: "parasha", searchTitle: "סיפורים לפרשת השבוע לילדים", label: "פרשת שבוע", emoji: "📜", description: "סיפורי התורה לפי פרשות השבוע" },
  { slug: "judaism", searchTitle: "סיפורים לשבת ולחגים לילדים", label: "יהדות", emoji: "🕯️", description: "שבת, חגים, מסורת וסיפורי חכמים" },
] as const satisfies readonly TaxonomyItem[];

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const CATEGORY_SLUGS: readonly string[] = CATEGORIES.map((c) => c.slug);

export function getCategory(slug: string): TaxonomyItem | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function categoryLabel(slug: string): string {
  return getCategory(slug)?.label ?? slug;
}

// --- Age groups -------------------------------------------------------------

export interface AgeGroupInfo {
  slug: AgeGroup;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  /** Guidance for authoring: rough words per page. */
  wordsPerPage: number;
}

export const AGE_GROUP_INFO: readonly AgeGroupInfo[] = [
  {
    slug: "0-2",
    label: "גילאי 0 עד 2",
    shortLabel: "0-2",
    emoji: "🍼",
    description: "משפטים קצרים, חזרות וצלילים",
    wordsPerPage: 10,
  },
  {
    slug: "3-5",
    label: "גילאי 3 עד 5",
    shortLabel: "3-5",
    emoji: "🧸",
    description: "סיפורים פשוטים עם התחלה, אמצע וסוף",
    wordsPerPage: 30,
  },
  {
    slug: "6-8",
    label: "גילאי 6 עד 8",
    shortLabel: "6-8",
    emoji: "🚀",
    description: "עלילה עשירה יותר לקוראים מתחילים",
    wordsPerPage: 60,
  },
];

export function getAgeGroup(slug: string): AgeGroupInfo | undefined {
  return AGE_GROUP_INFO.find((a) => a.slug === slug);
}

export function ageGroupLabel(slug: string): string {
  return getAgeGroup(slug)?.label ?? slug;
}

// --- Reading time buckets -----------------------------------------------------

export const READING_TIME_BUCKETS = [
  { slug: "5", label: "עד 5 דקות", emoji: "⏱️", min: 0, max: 5 },
  { slug: "10", label: "עד 10 דקות", emoji: "⏱️", min: 5, max: 10 },
  { slug: "15", label: "עד 15 דקות", emoji: "⏱️", min: 10, max: 15 },
  { slug: "20", label: "20 דקות ויותר", emoji: "⏱️", min: 15, max: Infinity },
] as const;

export type ReadingTimeBucket = (typeof READING_TIME_BUCKETS)[number]["slug"];

export const READING_TIME_SLUGS: readonly string[] = READING_TIME_BUCKETS.map((b) => b.slug);

/**
 * Bucket of a book: minutes in (min, max]. 1-5 -> "5", 6-10 -> "10",
 * 11-15 -> "15", above 15 -> "20".
 */
export function readingTimeBucket(minutes: number): ReadingTimeBucket {
  if (minutes <= 5) return "5";
  if (minutes <= 10) return "10";
  if (minutes <= 15) return "15";
  return "20";
}

export function getReadingTimeBucket(slug: string) {
  return READING_TIME_BUCKETS.find((b) => b.slug === slug);
}

export function readingTimeLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  return rounded === 1 ? "דקה אחת" : `${rounded} דקות`;
}

// --- Discussion themes --------------------------------------------------------

export const THEMES = [
  { slug: "courage", label: "אומץ", emoji: "🦁" },
  { slug: "kindness", label: "טוב לב", emoji: "💗" },
  { slug: "empathy", label: "אמפתיה", emoji: "🫶" },
  { slug: "friendship", label: "חברות", emoji: "🤝" },
  { slug: "self-confidence", label: "ביטחון עצמי", emoji: "🌟" },
  { slug: "honesty", label: "כנות", emoji: "🗣️" },
  { slug: "patience", label: "סבלנות", emoji: "🐢" },
  { slug: "sharing", label: "שיתוף", emoji: "🍪" },
  { slug: "curiosity", label: "סקרנות", emoji: "🔍" },
  { slug: "perseverance", label: "התמדה", emoji: "🧗" },
  { slug: "gratitude", label: "הכרת תודה", emoji: "🙏" },
  { slug: "responsibility", label: "אחריות", emoji: "🗝️" },
  { slug: "feelings", label: "רגשות", emoji: "🎭" },
  { slug: "family", label: "משפחה", emoji: "👨‍👩‍👧" },
  { slug: "independence", label: "עצמאות", emoji: "🧦" },
  { slug: "imagination", label: "דמיון", emoji: "🎈" },
] as const satisfies readonly TaxonomyItem[];

export type ThemeSlug = (typeof THEMES)[number]["slug"];

export const THEME_SLUGS: readonly string[] = THEMES.map((t) => t.slug);

export function getTheme(slug: string): TaxonomyItem | undefined {
  return THEMES.find((t) => t.slug === slug);
}

export function themeLabel(slug: string): string {
  return getTheme(slug)?.label ?? slug;
}

// --- Tags ----------------------------------------------------------------------

/** Starter list offered as suggestions. Tags are free text; books store the Hebrew label. */
export const STARTER_TAGS: readonly string[] = [
  "שינה",
  "לילה",
  "ירח",
  "כוכבים",
  "חורף",
  "גשם",
  "קיץ",
  "ים",
  "גינה",
  "יער",
  "חתולים",
  "כלבים",
  "ציפורים",
  "דינוזאורים",
  "דרקונים",
  "חלל",
  "רכבות",
  "אוכל",
  "צבעים",
  "מספרים",
  "אותיות",
  "גן ילדים",
  "בית ספר",
  "סבא וסבתא",
  "אחים",
  "יום הולדת",
  "חגים",
  "מוזיקה",
  "ספורט",
  "המצאות",
];

/**
 * Tags are stored as Hebrew labels and used directly in the URL: /tag/<encoded label>.
 * tagSlug() normalizes a label for comparison and for building the URL segment
 * (trim, collapse spaces to a dash). tagFromSlug() reverses it for display.
 */
export function tagSlug(tag: string): string {
  return tag.trim().replace(/\s+/g, "-");
}

export function tagFromSlug(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // keep the raw value
  }
  return decoded.replace(/-/g, " ").trim();
}

// --- Illustration styles (AI wizard and mock placeholders) ---------------------

export const ILLUSTRATION_STYLES = [
  { slug: "watercolor", label: "צבעי מים", emoji: "🎨" },
  { slug: "crayon", label: "צבעי פנדה", emoji: "🖍️" },
  { slug: "paper-cut", label: "גזירי נייר", emoji: "✂️" },
  { slug: "cartoon", label: "קומיקס עליז", emoji: "💬" },
  { slug: "pastel", label: "פסטל רך", emoji: "🌸" },
] as const satisfies readonly TaxonomyItem[];

export type IllustrationStyle = (typeof ILLUSTRATION_STYLES)[number]["slug"];
