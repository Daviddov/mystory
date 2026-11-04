import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import type { Book } from "@/lib/types";
import { BookCard, type BookCardProps } from "./BookCard";
import { EmptyState } from "./ui/EmptyState";

export interface BookGridProps {
  books: Book[];
  /** Rendered instead of the grid when there are no books. Default: a generic empty state. */
  empty?: ReactNode;
  /** Per-book overrides for the card (href, badge, footer). */
  cardProps?: (book: Book, index: number) => Partial<Omit<BookCardProps, "book">>;
  /** Interface language of the labels. Default Hebrew. */
  locale?: Locale;
  className?: string;
}

/** Columns of the book grid, shared with InfiniteBookGrid. */
export const BOOK_GRID_CLASSES = "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** Responsive grid of book cards: 2 columns on phones up to 6 on wide screens. */
export function BookGrid({ books, empty, cardProps, locale = DEFAULT_LOCALE, className }: BookGridProps) {
  if (books.length === 0) {
    const t = getMessages(locale).library;
    return <>{empty ?? <EmptyState title={t.noBooksTitle} description={t.noBooksDescription} />}</>;
  }
  return (
    <ul className={cn(BOOK_GRID_CLASSES, className)}>
      {books.map((book, index) => (
        <li key={book.id}>
          <BookCard book={book} priority={index < 6} locale={locale} {...cardProps?.(book, index)} />
        </li>
      ))}
    </ul>
  );
}
