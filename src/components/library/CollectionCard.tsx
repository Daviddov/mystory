import Link from "next/link";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import type { Book, Collection } from "@/lib/types";
import { bookCountLabel } from "./filters";
import { seasonInfo } from "./seasons";

export interface CollectionCardProps {
  collection: Collection;
  /** Published books of the collection (the first three covers are shown). */
  books: Book[];
  /** Marks the collection as fitting the current season. */
  inSeason?: boolean;
  className?: string;
}

/** A curated collection: a fan of covers, title, description and book count. */
export function CollectionCard({ collection, books, inSeason, className }: CollectionCardProps) {
  const season = seasonInfo(collection.season);
  const covers = books.slice(0, 3);
  return (
    <Link
      href={routes.collection(collection.slug)}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-card transition-transform duration-200 hover:-translate-y-1",
        className,
      )}
    >
      <div className="flex h-36 items-end justify-center gap-2 overflow-hidden rounded-md bg-surface-2 px-3 pt-3" aria-hidden="true">
        {covers.length === 0 ? (
          <span className="self-center text-6xl">🧺</span>
        ) : (
          covers.map((book, index) => {
            const cover = mediaUrl(book.coverImage, book.updatedAt);
            return (
              <div
                key={book.id}
                className={cn(
                  "aspect-[3/4] h-full min-w-0 shrink overflow-hidden rounded-t-md border border-b-0 border-border bg-surface shadow-card",
                  index === 1 && covers.length > 1 ? "translate-y-0" : "translate-y-3",
                )}
              >
                {cover ? (
                  <img src={cover} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-3xl">📖</div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="flex flex-col gap-2">
        {season ? (
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-soft px-3 py-1">
              <span aria-hidden="true">{season.emoji}</span>
              {season.label}
            </span>
            {inSeason ? <span className="rounded-full bg-accent px-3 py-1 text-accent-foreground">מתאים לעכשיו</span> : null}
          </p>
        ) : null}
        <h3 className="text-xl font-bold leading-snug">{collection.title}</h3>
        {collection.description ? (
          <p className="line-clamp-3 leading-relaxed text-muted">{collection.description}</p>
        ) : null}
        <p className="text-sm font-semibold text-secondary">{bookCountLabel(books.length)}</p>
      </div>
    </Link>
  );
}
