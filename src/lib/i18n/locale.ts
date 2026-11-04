/**
 * Language of the site's interface (header, footer, buttons, information
 * pages). Client-safe.
 *
 * The interface is Hebrew unless the visitor chose English with the language
 * switcher, which stores the choice in the LOCALE_COOKIE cookie. Addresses do
 * not change: search engines (which send no cookies) keep seeing the Hebrew
 * pages, and src/proxy.ts sends English visitors of the static library pages
 * to their dynamic twin, which reads the cookie.
 *
 * Books are not translated by this: a book is shown in its own language.
 */
export const LOCALES = ["he", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "he";

/** Same value as LOCALE_COOKIE in src/proxy.ts. */
export const LOCALE_COOKIE = "mystory_lang";

/** One year: the choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}
