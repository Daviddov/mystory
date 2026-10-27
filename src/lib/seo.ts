/**
 * Search-engine helpers shared by pages: absolute URLs, nikud-free text for
 * titles and descriptions, and schema.org JSON-LD objects.
 *
 * People search in Hebrew WITHOUT vowel points, so every string a search
 * engine matches against (title, description, structured data names, alt
 * text) goes through plainText(); the story itself keeps its nikud.
 */
import type { Metadata } from "next";
import { siteUrl } from "./config";
import { stripNikud } from "./hebrew";
import { routes } from "./routes";

export const SITE_NAME = "הסיפור שלי";
export const SITE_ALT_NAME = "mystory";
export const SITE_DESCRIPTION =
  "סיפורי ילדים לקריאה ולהאזנה בעברית: ספרים מאוירים עם ניקוד והקראה, סיפורים לפני השינה, לגיל הרך, לחגים ולפרשת השבוע. בחינם, בלי הרשמה ובלי פרסומות.";

/** Default page title: the phrase parents search for most, then the site name. */
export const SITE_TITLE = "הסיפור שלי: סיפורי ילדים לקריאה ולהאזנה";

/**
 * Phrases parents type when looking for what the library offers (Google's
 * Hebrew autocomplete, 2026). Google ignores the keywords tag; it is kept
 * short and true for the engines that still read it, and the same phrases are
 * worked into the visible titles and descriptions, which is what ranks.
 */
export const SITE_KEYWORDS = [
  "סיפורי ילדים",
  "סיפורים לילדים",
  "סיפורי ילדים לקריאה",
  "סיפורים לפני השינה",
  "סיפורי ילדים לשמיעה",
  "סיפורים לילדים להאזנה",
  "סיפורים עם ניקוד",
  "ספרי ילדים לקריאה בחינם",
  "סיפורים לגיל הרך",
  "סיפורים קצרים לילדים",
  "סיפורי פרשת השבוע לילדים",
  "סיפורים לחגים",
];

/**
 * Title, description, canonical URL and the matching Open Graph and Twitter
 * text for a public page. Next.js replaces (not merges) the root layout's
 * openGraph when a page sets its own, and keeps the root's when it does not,
 * so a page that only set `title` used to share with the home page's text.
 */
export function pageMetadata({
  title,
  description,
  path,
  shareTitle = title,
}: {
  title: string;
  description: string;
  path: string;
  /** Title for share cards, when it should differ from the page title. */
  shareTitle?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { siteName: SITE_NAME, type: "website", locale: "he_IL", title: shareTitle, description, url: path },
    twitter: { card: "summary_large_image", title: shareTitle, description },
  };
}

/** Absolute URL for a site path; absolute URLs pass through. Empty input gives undefined. */
export function absoluteUrl(pathOrUrl: string | undefined | null): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Text without nikud and collapsed whitespace, cut at a word boundary to `max` characters. */
export function plainText(text: string | undefined | null, max = Infinity): string {
  const clean = stripNikud(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** JSON for a <script type="application/ld+json">; "<" is escaped so content can never close the element. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** BreadcrumbList for a trail that starts after the home page (as PageHeading's crumbs). */
export function breadcrumbJsonLd(crumbs: BreadcrumbItem[]) {
  const trail = [{ label: "דף הבית", href: routes.home() }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: plainText(crumb.label),
      // The last crumb is the current page; Google takes its URL from the page itself.
      item: crumb.href ? absoluteUrl(crumb.href) : undefined,
    })),
  };
}

/** Organization + WebSite, for the home page. Lets Google show the site name and logo. */
export function siteJsonLd() {
  const base = siteUrl();
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: SITE_NAME,
      alternateName: SITE_ALT_NAME,
      url: `${base}/`,
      logo: `${base}/icons/icon-512.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: SITE_NAME,
      alternateName: SITE_ALT_NAME,
      url: `${base}/`,
      inLanguage: "he",
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${base}/#organization` },
    },
  ];
}

/** ItemList of book pages, for browsing pages (category, age, theme...). */
export function bookListJsonLd(books: { slug: string; title: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: books.map((book, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(routes.book(book.slug)),
      name: plainText(book.title),
    })),
  };
}
