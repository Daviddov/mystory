import Link from "next/link";
import { Check, Clock, Headphones, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { getAgeGroup, readingTimeLabel, tagSlug } from "@/lib/taxonomy";
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
  /** Show one line of the book's tags under the pills, as many as fit. */
  showTags?: boolean;
  /** A tag left out of that line, e.g. the tag of the tag page itself (compared with tagSlug()). */
  hideTag?: string;
  /** The signed-in viewer finished this book: shows a check mark on the cover. */
  read?: boolean;
  className?: string;
}

const AGE_TONES: Record<string, string> = {
  "0-2": "bg-accent-soft",
  "3-5": "bg-secondary-soft",
  "6-8": "bg-primary-soft",
};

/** Cover (3:4), title, and pills for age group and reading time. Works in Server and Client Components. */
export function BookCard({ book, href, layout = "grid", badge, footer, priority, showTags, hideTag, read, className }: BookCardProps) {
  const age = getAgeGroup(book.ageGroup);
  const cover = mediaUrl(book.coverImage, book.updatedAt);
  const tags = showTags
    ? book.tags.filter((tag) => hideTag === undefined || tagSlug(tag) !== tagSlug(hideTag))
    : [];
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
          {book.hasAudio ? (
            <span
              title="יש הקראה"
              className="absolute bottom-2 end-2 inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-card backdrop-blur-sm"
            >
              <Headphones aria-hidden="true" className="size-5" />
              <span className="sr-only">יש הקראה</span>
            </span>
          ) : null}
          {read ? (
            <span
              title="קראתם את הספר"
              className="absolute bottom-2 start-2 inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card"
            >
              <Check aria-hidden="true" className="size-5" />
              <span className="sr-only">קראתם את הספר</span>
            </span>
          ) : null}
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
        {tags.length > 0 ? (
          // One line: tags that do not fit wrap to a hidden second line.
          <p className="flex max-h-6 flex-wrap gap-1 overflow-hidden px-0.5" aria-label={`תגיות: ${tags.join(", ")}`}>
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-6 items-center rounded-full border border-border px-2 text-xs text-muted"
              >
                #{tag}
              </span>
            ))}
          </p>
        ) : null}
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
