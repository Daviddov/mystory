import { Chip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { SORT_OPTIONS, type LibrarySort } from "./filters";

export interface SortChipsProps {
  current: LibrarySort;
  hrefFor: (sort: LibrarySort) => string;
  /** Interface language of the labels. Default Hebrew. */
  locale?: Locale;
  className?: string;
}

/** Sort order as links, so it works without JavaScript and is shareable. */
export function SortChips({ current, hrefFor, locale = DEFAULT_LOCALE, className }: SortChipsProps) {
  const t = getMessages(locale).library;
  return (
    <nav aria-label={t.sortNav} className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm font-semibold text-muted">{t.sortLabel}</span>
      {SORT_OPTIONS.map((option) => (
        <Chip key={option.value} href={hrefFor(option.value)} selected={option.value === current}>
          {t.sort[option.value]}
        </Chip>
      ))}
    </nav>
  );
}
