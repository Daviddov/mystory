import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { SectionTitle } from "./library/SectionTitle";
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
      <SectionTitle emoji={emoji} href={href} hrefLabel={hrefLabel}>
        {title}
      </SectionTitle>
      <ul className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 pt-2 sm:-mx-6 sm:gap-5 sm:px-6">
        {books.map((book, index) => (
          <li key={book.id} className="snap-start">
            <BookCard book={book} layout="shelf" {...cardProps?.(book, index)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
