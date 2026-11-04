"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/cn";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n/locale";
import { useT } from "../i18n/LocaleProvider";

/**
 * Switches the interface between Hebrew and English. The choice is a cookie,
 * so addresses stay the same; the page reloads because the static library
 * pages are cached in Hebrew and only a new request reaches the English twin.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useT();
  const next: Locale = locale === "he" ? "en" : "he";
  return (
    <button
      type="button"
      lang={next}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
        window.location.reload();
      }}
      title={t.header.switchLanguage}
      aria-label={t.header.switchLanguage}
      className={cn(
        "inline-flex min-h-touch shrink-0 items-center justify-center gap-1 rounded-full px-2.5 font-semibold text-foreground hover:bg-surface-2",
        className,
      )}
    >
      <Languages aria-hidden="true" className="size-5" />
      <span aria-hidden="true">{t.header.switchLanguageShort}</span>
    </button>
  );
}
