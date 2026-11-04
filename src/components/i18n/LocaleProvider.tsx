"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { getMessages, type Messages } from "@/lib/i18n/messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Gives Client Components the interface language the root layout rendered with. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Messages of the interface language, with the locale itself. */
export function useT(): { locale: Locale; t: Messages } {
  const locale = useLocale();
  return { locale, t: getMessages(locale) };
}
