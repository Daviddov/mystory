/** Navigation link lists used by the header and the footer. Client-safe. */
import { DEFAULT_LOCALE, type Locale } from "./i18n/locale";
import { getMessages, taxonomyText } from "./i18n/messages";
import { routes } from "./routes";
import { AGE_GROUP_INFO, CATEGORIES, READING_TIME_BUCKETS, STARTER_TAGS, THEMES } from "./taxonomy";

export interface NavLink {
  href: string;
  label: string;
  emoji?: string;
}

/** Every navigation list, with labels in the interface language. */
export function navFor(locale: Locale) {
  const t = getMessages(locale).nav;
  return {
    main: [
      { href: routes.books(), label: t.books, emoji: "📚" },
      { href: routes.collections(), label: t.collections, emoji: "🧺" },
      { href: routes.listen(), label: t.listen, emoji: "🎧" },
      { href: routes.personalBook(), label: t.personalBook, emoji: "✨" },
      { href: routes.studio(), label: t.studio, emoji: "🎨" },
    ],
    age: AGE_GROUP_INFO.map((a) => ({
      href: routes.age(a.slug),
      label: taxonomyText(locale, "age", a.slug, a).label,
      emoji: a.emoji,
    })),
    category: CATEGORIES.map((c) => ({
      href: routes.category(c.slug),
      label: taxonomyText(locale, "category", c.slug, c).label,
      emoji: c.emoji,
    })),
    time: READING_TIME_BUCKETS.map((b) => ({
      href: routes.time(b.slug),
      label: taxonomyText(locale, "time", b.slug, b).label,
      emoji: b.emoji,
    })),
    theme: THEMES.map((th) => ({
      href: routes.theme(th.slug),
      label: taxonomyText(locale, "theme", th.slug, th).label,
      emoji: th.emoji,
    })),
    tag: STARTER_TAGS.slice(0, 12).map((tag) => ({
      href: routes.tag(tag),
      label: taxonomyText(locale, "tag", tag, { label: tag }).label,
    })),
    studio: [
      { href: routes.studio(), label: t.studioBooks },
      { href: routes.studioNew(), label: t.studioNew },
      { href: routes.studioImport(), label: t.studioImport },
      { href: routes.create(), label: t.personalBook },
    ],
    account: [
      { href: routes.me(), label: t.me },
      { href: routes.favorites(), label: t.favorites },
      { href: routes.offline(), label: t.offline },
    ],
    info: [
      { href: routes.about(), label: t.about },
      { href: routes.faq(), label: t.faq },
      { href: routes.privacy(), label: t.privacy },
      { href: routes.terms(), label: t.terms },
    ],
  } satisfies Record<string, NavLink[]>;
}

const HEBREW_NAV = navFor(DEFAULT_LOCALE);

export const MAIN_NAV: NavLink[] = HEBREW_NAV.main;
export const AGE_NAV: NavLink[] = HEBREW_NAV.age;
export const CATEGORY_NAV: NavLink[] = HEBREW_NAV.category;
export const TIME_NAV: NavLink[] = HEBREW_NAV.time;
export const THEME_NAV: NavLink[] = HEBREW_NAV.theme;
export const TAG_NAV: NavLink[] = HEBREW_NAV.tag;
export const STUDIO_NAV: NavLink[] = HEBREW_NAV.studio;
export const ACCOUNT_NAV: NavLink[] = HEBREW_NAV.account;
export const INFO_NAV: NavLink[] = HEBREW_NAV.info;
