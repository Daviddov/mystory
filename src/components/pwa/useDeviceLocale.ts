"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { LOCALE_COOKIE, isLocale, localeDir, type Locale } from "@/lib/i18n/locale";

function cookieLocale(): Locale | null {
  try {
    for (const part of document.cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === LOCALE_COOKIE) {
        const value = decodeURIComponent(rest.join("="));
        return isLocale(value) ? value : null;
      }
    }
  } catch {
    // cookies blocked
  }
  return null;
}

const noopSubscribe = () => () => {};

/**
 * Interface language of the offline pages. The service worker stores those
 * pages without cookies, so they are always rendered in Hebrew; the visitor's
 * choice is read from the language cookie on the device instead, and the
 * document's language and direction follow it.
 */
export function useDeviceLocale(): Locale {
  const rendered = useLocale();
  const locale = useSyncExternalStore(
    noopSubscribe,
    () => cookieLocale() ?? rendered,
    () => rendered,
  );
  useEffect(() => {
    const root = document.documentElement;
    if (root.lang === locale) return;
    root.lang = locale;
    root.dir = localeDir(locale);
  }, [locale]);
  return locale;
}
