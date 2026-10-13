/** Server-side loading of a book for the reader, with the access check. */
import "server-only";
import { cache } from "react";
import { z } from "zod";
import { canEditBook, canViewBook, getCurrentUser } from "../auth";
import { toPublicBook, type PublicBook } from "../public-book";
import { getRepo } from "../repo";
import { SlugSchema, type Book, type BookWithPages, type User } from "../types";
import type { StoredProgress } from "./logic";

const TokenSchema = z.string().min(1).max(128);

export type ReaderLoadResult =
  | { ok: true; book: BookWithPages; user: User | null; isOwnerOrStaff: boolean; viaToken: boolean }
  /** Missing and forbidden look the same on purpose, so private slugs cannot be probed. */
  | { ok: false; user: User | null };

/**
 * Loads a book by slug and decides whether this request may read it:
 * published books are public; anything else needs the owner (or an editor)
 * or the book's share token. Deduplicated per request.
 */
export const loadBookForReader = cache(async (slug: string, token?: string): Promise<ReaderLoadResult> => {
  const user = await getCurrentUser();
  const parsedSlug = SlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { ok: false, user };
  const parsedToken = TokenSchema.safeParse(token);
  const shareToken = parsedToken.success ? parsedToken.data : null;

  const repo = await getRepo();
  const book = await repo.getBookBySlug(parsedSlug.data);
  if (!book || !canViewBook(book, user, shareToken)) return { ok: false, user };

  const isOwnerOrStaff = canEditBook(book, user);
  const viaToken = book.status !== "published" && !isOwnerOrStaff;
  return { ok: true, book, user, isOwnerOrStaff, viaToken };
});

/** The signed-in reader's saved position, or null. Never throws: resume is a nicety. */
export async function loadServerProgress(user: User | null, bookId: string): Promise<StoredProgress | null> {
  if (!user) return null;
  try {
    const progress = await (await getRepo()).getProgress(user.id, bookId);
    return progress
      ? { pageIndex: progress.pageIndex, completed: progress.completed, updatedAt: progress.updatedAt }
      : null;
  } catch (error) {
    console.warn("[reader] could not load progress", error);
    return null;
  }
}

/**
 * Published books to offer on the end screen: same age group first, ranked by
 * shared categories and themes, then by popularity. Never throws.
 *
 * Returns PublicBook: the result becomes a prop of the client-side reader and
 * is serialised into the HTML of every visitor, so share tokens, owner ids and
 * review notes of other people's books must not be in it.
 */
export async function recommendBooks(book: Book, limit = 4): Promise<PublicBook[]> {
  try {
    const repo = await getRepo();
    const sameAge = await repo.listBooks({
      ageGroup: book.ageGroup,
      excludeIds: [book.id],
      sort: "popular",
      limit: 24,
    });
    const overlap = (other: Book) =>
      other.categories.filter((slug) => book.categories.includes(slug)).length * 2 +
      other.themes.filter((slug) => book.themes.includes(slug)).length;
    // Array.prototype.sort is stable, so equal scores keep the popularity order.
    const ranked = [...sameAge.books].sort((a, b) => overlap(b) - overlap(a)).slice(0, limit);
    if (ranked.length >= limit) return ranked.map(toPublicBook);
    const more = await repo.listBooks({
      excludeIds: [book.id, ...ranked.map((entry) => entry.id)],
      sort: "popular",
      limit: limit - ranked.length,
    });
    return [...ranked, ...more.books].map(toPublicBook);
  } catch (error) {
    console.warn("[reader] could not load recommendations", error);
    return [];
  }
}
