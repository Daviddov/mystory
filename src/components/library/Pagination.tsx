import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { pageWindow } from "./filters";

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  /** Interface language of the labels. Default Hebrew. */
  locale?: Locale;
  className?: string;
}

const ITEM = "inline-flex min-h-touch min-w-12 items-center justify-center rounded-full text-lg font-semibold";

/** Pager for listings. Renders nothing when there is a single page. In RTL "next" points left. */
export function Pagination({ page, pages, hrefFor, locale = DEFAULT_LOCALE, className }: PaginationProps) {
  if (pages <= 1) return null;
  const t = getMessages(locale).library;
  return (
    <nav aria-label={t.pages} className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={cn(ITEM, "gap-1 px-4 hover:bg-surface-2")}>
          <ChevronRight aria-hidden="true" className="size-5 ltr:-scale-x-100" />
          {t.previous}
        </Link>
      ) : null}
      <ul className="flex items-center gap-1">
        {pageWindow(page, pages).map((entry, index) =>
          entry === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={hrefFor(entry)}
                aria-label={t.page(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  ITEM,
                  entry === page ? "bg-primary text-primary-foreground" : "bg-surface-2 hover:brightness-95",
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={cn(ITEM, "gap-1 px-4 hover:bg-surface-2")}>
          {t.next}
          <ChevronLeft aria-hidden="true" className="size-5 ltr:-scale-x-100" />
        </Link>
      ) : null}
    </nav>
  );
}
