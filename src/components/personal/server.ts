/** Server-side helpers shared by the favorites, progress, share and offline routes. */
import "server-only";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { canViewBook } from "@/lib/auth";
import { getRepo, NotFoundError } from "@/lib/repo";
import { isSameOriginRequest } from "@/lib/same-origin";
import { ID_PATTERN, SLUG_PATTERN, type BookWithPages, type User } from "@/lib/types";

export const BookIdSchema = z.string().regex(ID_PATTERN, "invalid book id");
export const BookSlugSchema = z.string().min(1).max(80).regex(SLUG_PATTERN, "invalid slug");
/** Share tokens are 24 alphanumeric characters (see newShareToken); be a little lenient on length. */
export const ShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "invalid token");

/** Largest batch accepted by the merge endpoints. */
export const MAX_BATCH = 200;

/**
 * Rejects cross-site requests to mutating routes. The session cookie is
 * SameSite=Lax already; this is a second, explicit check.
 * Returns a 403 response, or null when the request may proceed.
 */
export function rejectCrossOrigin(request: Request): Response | null {
  // The rules live in one place for every route family: @/lib/same-origin.
  return isSameOriginRequest(request) ? null : jsonError(403, "הבקשה נחסמה");
}

/** Reads a JSON body; an empty or invalid body becomes `{}` so zod reports the problem. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * Loads a book by id (or slug) and checks that `user` may see it.
 * Throws NotFoundError both when it is missing and when it is not viewable,
 * so the response never reveals that a private book exists.
 */
export async function loadViewableBook(
  ref: { bookId?: string; slug?: string },
  user: User | null,
  shareToken?: string | null,
): Promise<BookWithPages> {
  const repo = await getRepo();
  const book = ref.bookId
    ? await repo.getBookById(ref.bookId)
    : ref.slug
      ? await repo.getBookBySlug(ref.slug)
      : null;
  if (!book || !canViewBook(book, user, shareToken)) throw new NotFoundError("book");
  return book;
}

/** The projection of a book that may be sent to a client that does not own it: see @/lib/public-book. */
export { toPublicBook, type PublicBook } from "@/lib/public-book";

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;
