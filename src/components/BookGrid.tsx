import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { BookCard, type BookCardProps } from "./BookCard";
import { EmptyState } from "./ui/EmptyState";

export interface BookGridProps {
  books: Book[];
  /** Rendered instead of the grid when there are no books. Default: a generic empty state. */
  empty?: ReactNode;
  /** Per-book overrides for the card (href, badge, footer). */
  cardProps?: (book: Book, index: number) => Partial<Omit<BookCardProps, "book">>;
  className?: string;
}

/** Responsive grid of book cards: 2 columns on phones up to 6 on wide screens. */
export function BookGrid({ books, empty, cardProps, className }: BookGridProps) {
  if (books.length === 0) {
    return <>{empty ?? <EmptyState title="לא מצאנו ספרים" description="נסו לשנות את הסינון או לחפש משהו אחר." />}</>;
  }
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
    >
      {books.map((book, index) => (
        <li key={book.id}>
          <BookCard book={book} priority={index < 6} {...cardProps?.(book, index)} />
        </li>
      ))}
    </ul>
  );
}
