/**
 * Page titles (the browser tab) in the interface language. Server only.
 *
 * Pages keep building their Hebrew metadata as before: it is what search
 * engines see, because crawlers send no language cookie (and the static pages
 * have no cookies at all). For a visitor who chose English, localizeTitle()
 * swaps in an English title; everything else (description, canonical, robots,
 * share cards) stays as it is. The root layout's title template adds the
 * English site name.
 */
import "server-only";
import type { Metadata } from "next";
import { getLocale } from "./server";

export const SITE_NAME_EN = "My Story";
export const SITE_TITLE_EN = "My Story: children's stories to read and listen to";

/** English for the generic titles that several pages return when nothing is found. */
const GENERIC_EN: Record<string, string> = {
  "הדף לא נמצא": "Page not found",
  "הספר לא נמצא": "Book not found",
  "האוסף לא נמצא": "Collection not found",
};

/**
 * `meta` with an English title when the visitor chose English. `en` is the
 * English title (shown with the " | My Story" suffix), or `{ absolute }` for a
 * full title. A generic "not found" title is translated even without `en`.
 */
export async function localizeTitle(
  meta: Metadata | Promise<Metadata>,
  en?: string | { absolute: string },
): Promise<Metadata> {
  const resolved = await meta;
  if ((await getLocale()) === "he") return resolved;
  const generic = typeof resolved.title === "string" ? GENERIC_EN[resolved.title] : undefined;
  const title = generic ?? en;
  return title === undefined ? resolved : { ...resolved, title };
}
