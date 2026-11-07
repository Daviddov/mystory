/**
 * Page titles (the browser tab) in the interface language. Server only.
 *
 * Pages keep building their Hebrew metadata as before: it is what search
 * engines see, because crawlers send no language cookie (and the static pages
 * have no cookies at all). For a visitor who chose English, localizeTitle()
 * swaps in an English title (and description, when the page has one);
 * everything else (canonical, robots) stays as it is. The root layout's title
 * template adds the English site name.
 *
 * Every page that has an English twin at /en also names both versions to
 * search engines (hreflang), and the twin itself is its own canonical.
 */
import "server-only";
import type { Metadata } from "next";
import { englishPath, hasEnglishPage, hebrewPath } from "./paths";
import { getLocale, isEnglishAddress } from "./server";

export const SITE_NAME_EN = "My Story";
export const SITE_TITLE_EN = "My Story: children's stories to read and listen to";
export const SITE_DESCRIPTION_EN =
  "Hebrew children's stories to read and listen to: illustrated picture books with nikud (vowel points) and narration, bedtime stories, and stories for the Jewish holidays and the weekly Torah portion. Free, with no sign-up and no ads.";

/** English for the generic titles that several pages return when nothing is found. */
const GENERIC_EN: Record<string, string> = {
  "הדף לא נמצא": "Page not found",
  "הספר לא נמצא": "Book not found",
  "האוסף לא נמצא": "Collection not found",
};

/**
 * `meta` with hreflang links to the Hebrew and English addresses of the page
 * (when it has both and is indexable). At an /en address the page is its own
 * canonical and its share cards are in English.
 */
function withLanguageLinks(meta: Metadata, atEnglishAddress: boolean): Metadata {
  const canonical = meta.alternates?.canonical;
  if (typeof canonical !== "string" || !hasEnglishPage(canonical)) return meta;
  if (typeof meta.robots === "object" && meta.robots !== null && "index" in meta.robots && meta.robots.index === false) return meta;
  const he = hebrewPath(canonical);
  const en = englishPath(he);
  const result: Metadata = {
    ...meta,
    alternates: { ...meta.alternates, canonical: atEnglishAddress ? en : he, languages: { he, en, "x-default": he } },
  };
  if (atEnglishAddress && meta.openGraph) {
    result.openGraph = { ...meta.openGraph, locale: "en_US", alternateLocale: "he_IL", url: en };
  }
  return result;
}

/**
 * `meta` with an English title when the visitor chose English. `en` is the
 * English title (shown with the " | My Story" suffix), or `{ absolute }` for a
 * full title. A generic "not found" title is translated even without `en`.
 * `enDescription` is the English description; a page without one gets the
 * site's, rather than a Hebrew sentence on an English page.
 */
export async function localizeTitle(
  meta: Metadata | Promise<Metadata>,
  en?: string | { absolute: string },
  enDescription?: string,
): Promise<Metadata> {
  const resolved = withLanguageLinks(await meta, await isEnglishAddress());
  if ((await getLocale()) === "he") return resolved;
  const generic = typeof resolved.title === "string" ? GENERIC_EN[resolved.title] : undefined;
  const title = generic ?? en;
  const result: Metadata = title === undefined ? { ...resolved } : { ...resolved, title };
  if (result.description) {
    const description = enDescription ?? SITE_DESCRIPTION_EN;
    result.description = description;
    if (result.openGraph) result.openGraph = { ...result.openGraph, description };
    if (result.twitter) result.twitter = { ...result.twitter, description };
  }
  if (title !== undefined) {
    const shareTitle = typeof title === "string" ? title : title.absolute;
    if (result.openGraph) result.openGraph = { ...result.openGraph, title: shareTitle };
    if (result.twitter) result.twitter = { ...result.twitter, title: shareTitle };
  }
  return result;
}
