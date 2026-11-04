import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, toLocale, type Locale } from "./locale";
import { getMessages, type Messages } from "./messages";

/**
 * The visitor's interface language. Pages rendered with
 * `dynamic = "force-static"` see no cookies and always get Hebrew; English
 * visitors of those pages are sent to the dynamic twin by src/proxy.ts.
 */
export async function getLocale(): Promise<Locale> {
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** Messages of the visitor's interface language, with the locale itself. */
export async function getT(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale();
  return { locale, t: getMessages(locale) };
}
