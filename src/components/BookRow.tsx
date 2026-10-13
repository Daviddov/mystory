import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { BookCard, type BookCardProps } from "./BookCard";

export interface BookRowProps {
  title: ReactNode;
  books: Book[];
  /** Leading emoji for the heading. */
  emoji?: string;
  /** "See all" link target. */
  href?: string;
  /** Text of the "see all" link. Default "לכל הספרים". */
  hrefLabel?: string;
  /** Per-book overrides for the card (href, badge, footer). */
  cardProps?: (book: Book, index: number) => Partial<Omit<BookCardProps, "book">>;
  className?: string;
}

/** A titled horizontal shelf that scrolls sideways. Renders nothing when there are no books. */
export function BookRow({ title, books, emoji, href, hrefLabel = "לכל הספרים", cardProps, className }: BookRowProps) {
  if (books.length === 0) return null;
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-bold sm:text-3xl">
          {emoji ? <span aria-hidden="true">{emoji} </span> : null}
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 font-semibold text-secondary hover:bg-surface-2"
          >
            {hrefLabel}
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
        ) : null}
      </div>
      <ul className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 pt-1 sm:-mx-6 sm:px-6">
        {books.map((book, index) => (
          <li key={book.id} className="snap-start">
            <BookCard book={book} layout="shelf" {...cardProps?.(book, index)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
