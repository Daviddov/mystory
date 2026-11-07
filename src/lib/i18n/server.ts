import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, toLocale, type Locale } from "./locale";
import { getMessages, type Messages } from "./messages";
import { LOCALE_HEADER } from "./paths";

/**
 * Whether the request came to an /en address (src/proxy.ts marks it). Such a
 * page is English whatever the cookie says. Pages rendered with
 * `dynamic = "force-static"` see no headers: false.
 */
export async function isEnglishAddress(): Promise<boolean> {
  return (await headers()).get(LOCALE_HEADER) === "en";
}

/**
 * The visitor's interface language: English at an /en address, otherwise the
 * cookie. Pages rendered with `dynamic = "force-static"` see no cookies and
 * always get Hebrew; English visitors of those pages are sent to the dynamic
 * twin by src/proxy.ts.
 */
export async function getLocale(): Promise<Locale> {
  if (await isEnglishAddress()) return "en";
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** Messages of the visitor's interface language, with the locale itself. */
export async function getT(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale();
  return { locale, t: getMessages(locale) };
}
