"use client";

import { BookCard } from "@/components/BookCard";
import { usePersonal } from "@/components/personal/hooks";
import type { PublicBook } from "@/lib/public-book";
import { routes } from "@/lib/routes";
import { SectionTitle } from "./SectionTitle";

/** "Continue reading": books started on this device and not finished, most recent first. Hidden when there are none. */
export function ContinueReading({ books }: { books: PublicBook[] }) {
  const { progress } = usePersonal();
  const byId = new Map(books.map((book) => [book.id, book]));
  const started = progress
    .filter((item) => !item.completed && byId.has(item.bookId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);
  if (started.length === 0) return null;

  return (
    <section aria-labelledby="continue-title" className="flex flex-col gap-4">
      <SectionTitle id="continue-title" emoji="🔖">
        ממשיכים לקרוא
      </SectionTitle>
      <ul className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 pt-2 sm:-mx-6 sm:gap-5 sm:px-6">
        {started.map((item) => {
          const book = byId.get(item.bookId)!;
          const page = item.pageIndex + 1;
          return (
            <li key={book.id} className="snap-start">
              <BookCard
                book={book}
                layout="shelf"
                href={routes.read(book.slug, page)}
                badge={page > 1 ? `עמוד ${page}` : "התחלנו"}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
