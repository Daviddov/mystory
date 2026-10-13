/**
 * The projection of a book that may be sent to a browser that does not own it.
 * Client-safe.
 *
 * Props of Client Components are serialised into the page HTML, so a full
 * `Book` handed to one leaks every field to every visitor. Anything that
 * crosses to the client for a reader (recommendations, favourites, listings)
 * must go through toPublicBook() at the boundary. The props are typed
 * PublicBook, but TypeScript accepts a full Book there (extra fields are
 * allowed), so the type does not enforce the mapping: the call does.
 */
import type { Book, BookWithPages } from "./types";

/**
 * Fields only the owner and the staff may see:
 *  - shareToken   opens the book for anyone who has it
 *  - ownerId      the account id of the author
 *  - reviewNote   the editor's note to the author
 *  - costUsd      what the generation cost
 */
export const PRIVATE_BOOK_FIELDS = ["shareToken", "ownerId", "reviewNote", "costUsd"] as const;
export type PrivateBookField = (typeof PRIVATE_BOOK_FIELDS)[number];

/** Book fields that are safe to send to any client that may view the book. No pages. */
export type PublicBook = Omit<Book, PrivateBookField>;

/** The same, with the pages: what a reader needs. */
export type PublicBookWithPages = Omit<BookWithPages, PrivateBookField>;

function withoutPrivateFields<T extends object>(book: T): Omit<T, PrivateBookField> {
  const copy = { ...book } as Record<string, unknown>;
  for (const field of PRIVATE_BOOK_FIELDS) delete copy[field];
  return copy as Omit<T, PrivateBookField>;
}

/** Removes the private fields and the pages. */
export function toPublicBook(book: Book | BookWithPages): PublicBook {
  const { pages: _pages, ...rest } = withoutPrivateFields(book) as PublicBook & { pages?: unknown };
  return rest;
}

/** Removes the private fields and keeps the pages. */
export function toPublicBookWithPages(book: BookWithPages): PublicBookWithPages {
  return withoutPrivateFields(book);
}
