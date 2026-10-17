import Link from "next/link";
import { Clock, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { getAgeGroup, readingTimeLabel } from "@/lib/taxonomy";
import type { PublicBook } from "@/lib/public-book";

export interface BookCardProps {
  /** A full Book works too. Client Components must pass a PublicBook (see @/lib/public-book). */
  book: PublicBook;
  /** Where the card leads. Default: the reader, which asks whether to read, listen or download; a "details" link sits under the card. */
  href?: string;
  /** 'shelf' is a fixed-width card for horizontal rows. Default 'grid' (fills its grid cell). */
  layout?: "grid" | "shelf";
  /** Small label over the cover corner, e.g. "חדש" or a draft status. */
  badge?: ReactNode;
  /** Extra controls rendered under the title, outside the link (favorite button, edit actions). */
  footer?: ReactNode;
  /** Load the cover eagerly (for the first row of a page). */
  priority?: boolean;
  className?: string;
}

const AGE_TONES: Record<string, string> = {
  "0-2": "bg-accent-soft",
  "3-5": "bg-secondary-soft",
  "6-8": "bg-primary-soft",
};

/** Cover (3:4), title, and pills for age group and reading time. Works in Server and Client Components. */
export function BookCard({ book, href, layout = "grid", badge, footer, priority, className }: BookCardProps) {
  const age = getAgeGroup(book.ageGroup);
  const cover = mediaUrl(book.coverImage, book.updatedAt);
  return (
    <article className={cn("group relative flex flex-col", layout === "shelf" && "w-40 shrink-0 sm:w-48", className)}>
      <Link
        href={href ?? routes.readStart(book.slug)}
        className="flex flex-col gap-2.5 rounded-[1.25rem] focus-visible:outline-offset-4"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-surface-2 shadow-card ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-lift group-active:scale-[0.98]">
          {cover ? (
            <img
              src={cover}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-6xl" aria-hidden="true">
              📖
            </div>
          )}
          {badge ? (
            <span className="absolute start-2 top-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground shadow-card">
              {badge}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 px-0.5 text-lg font-semibold leading-snug">{book.title}</h3>
        <p className="flex flex-wrap items-center gap-1.5 px-0.5">
          {age ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground",
                AGE_TONES[age.slug] ?? "bg-surface-2",
              )}
            >
              <span aria-hidden="true">{age.emoji}</span>
              {age.label}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
            <Clock aria-hidden="true" className="size-3.5" />
            {readingTimeLabel(book.readingMinutes)}
          </span>
        </p>
      </Link>
      {href === undefined ? (
        <Link
          href={routes.book(book.slug)}
          title="לפרטים"
          className="absolute end-2 top-2 inline-flex size-10 items-center justify-center rounded-full bg-surface/90 text-foreground opacity-90 shadow-card backdrop-blur-sm transition hover:bg-surface hover:opacity-100"
        >
          <Info aria-hidden="true" className="size-5" />
          <span className="sr-only">לפרטים על {book.title}</span>
        </Link>
      ) : null}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </article>
  );
}
