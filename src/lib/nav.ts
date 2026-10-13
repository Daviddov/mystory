/** Navigation link lists used by the header and the footer. Client-safe. */
import { routes } from "./routes";
import { AGE_GROUP_INFO, CATEGORIES, READING_TIME_BUCKETS, STARTER_TAGS, THEMES } from "./taxonomy";

export interface NavLink {
  href: string;
  label: string;
  emoji?: string;
}

export const MAIN_NAV: NavLink[] = [
  { href: routes.books(), label: "כל הספרים", emoji: "📚" },
  { href: routes.collections(), label: "אוספים", emoji: "🧺" },
  { href: routes.listen(), label: "האזנה לפני השינה", emoji: "🎧" },
  { href: routes.create(), label: "יצירת ספר אישי", emoji: "✨" },
  { href: routes.studio(), label: "הסטודיו", emoji: "🎨" },
];

export const AGE_NAV: NavLink[] = AGE_GROUP_INFO.map((a) => ({
  href: routes.age(a.slug),
  label: a.label,
  emoji: a.emoji,
}));

export const CATEGORY_NAV: NavLink[] = CATEGORIES.map((c) => ({
  href: routes.category(c.slug),
  label: c.label,
  emoji: c.emoji,
}));

export const TIME_NAV: NavLink[] = READING_TIME_BUCKETS.map((b) => ({
  href: routes.time(b.slug),
  label: b.label,
  emoji: b.emoji,
}));

export const THEME_NAV: NavLink[] = THEMES.map((t) => ({
  href: routes.theme(t.slug),
  label: t.label,
  emoji: t.emoji,
}));

export const TAG_NAV: NavLink[] = STARTER_TAGS.slice(0, 12).map((tag) => ({
  href: routes.tag(tag),
  label: tag,
}));

export const STUDIO_NAV: NavLink[] = [
  { href: routes.studio(), label: "הספרים שלי בסטודיו" },
  { href: routes.studioNew(), label: "ספר חדש" },
  { href: routes.studioImport(), label: "ייבוא ספר" },
  { href: routes.create(), label: "יצירת ספר אישי" },
];

export const ACCOUNT_NAV: NavLink[] = [
  { href: routes.me(), label: "המדף שלי" },
  { href: routes.favorites(), label: "המועדפים שלי" },
  { href: routes.offline(), label: "ספרים בלי רשת" },
];

export const INFO_NAV: NavLink[] = [
  { href: routes.about(), label: "על האתר" },
  { href: routes.faq(), label: "שאלות ותשובות" },
  { href: routes.privacy(), label: "מדיניות פרטיות" },
  { href: routes.terms(), label: "תנאי שימוש" },
];
