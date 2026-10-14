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

/** Cover (3:4), title, age group and reading time. Works in Server and Client Components. */
export function BookCard({ book, href, layout = "grid", badge, footer, priority, className }: BookCardProps) {
  const age = getAgeGroup(book.ageGroup);
  const cover = mediaUrl(book.coverImage, book.updatedAt);
  return (
    <article className={cn("group relative flex flex-col", layout === "shelf" && "w-40 shrink-0 sm:w-48", className)}>
      <Link
        href={href ?? routes.readStart(book.slug)}
        className="flex flex-col gap-2 rounded-lg focus-visible:outline-offset-4"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface-2 shadow-card transition-transform duration-200 group-hover:-translate-y-1">
          {cover ? (
            <img
              src={cover}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className="size-full object-cover"
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
        <h3 className="line-clamp-2 text-lg font-bold leading-snug">{book.title}</h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {age ? (
            <span>
              <span aria-hidden="true">{age.emoji} </span>
              {age.label}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-4" />
            {readingTimeLabel(book.readingMinutes)}
          </span>
        </p>
      </Link>
      {href === undefined ? (
        <Link
          href={routes.book(book.slug)}
          className="mt-1 inline-flex min-h-10 w-fit items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          <Info aria-hidden="true" className="size-4" />
          לפרטים
          <span className="sr-only"> על {book.title}</span>
        </Link>
      ) : null}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </article>
  );
}
