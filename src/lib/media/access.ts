/**
 * Who may download a media file. Used by the /media route in both storage
 * modes. No "server-only" import, so the decision can be unit tested; the
 * caller supplies the repository and the current user.
 *
 * Files of a book live under "books/<bookId>/". They follow the book:
 *   - published book            -> anyone ("public")
 *   - any other status          -> the owner, editors and admins (session
 *                                  cookie), or a request that carries the
 *                                  book's share token in `?t=` ("private")
 *   - no such book              -> staff only (files of a book that is still
 *                                  being generated or imported)
 * Family recordings live under "books/<bookId>/rec/<recordingId>/". Until a
 * recording is approved only the person who made it and staff may hear it;
 * an approved recording follows its book.
 * Everything outside "books/" (the seeded library, "seed-<name>/...") is site
 * content and public.
 */
import { timingSafeEqual } from "node:crypto";
import type { Repository } from "../repo/types";
import { ID_PATTERN, type Book, type Recording, type User } from "../types";

/** Query parameter that carries a share token on a media URL (see mediaUrl()). */
export const MEDIA_TOKEN_PARAM = "t";

export type MediaAccess = "public" | "private" | "denied";

type BookAccessFields = Pick<Book, "status" | "ownerId" | "shareToken">;

/** The book id of a media path under "books/<bookId>/...", or null for site content. */
export function mediaBookId(mediaPath: string): string | null {
  const parts = mediaPath.split("/");
  return parts.length >= 3 && parts[0] === "books" && parts[1].length > 0 ? parts[1] : null;
}

/** The recording id of a media path under "books/<bookId>/rec/<recordingId>/...", or null. */
export function mediaRecordingId(mediaPath: string): string | null {
  const parts = mediaPath.split("/");
  return parts.length >= 5 && parts[0] === "books" && parts[2] === "rec" && parts[3].length > 0 ? parts[3] : null;
}

/** Media folder of one recording. */
export function recordingMediaPrefix(bookId: string, recordingId: string): string {
  return `books/${bookId}/rec/${recordingId}`;
}

function sameToken(given: string | null | undefined, stored: string | undefined): boolean {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isStaff(user: Pick<User, "role"> | null): boolean {
  return !!user && (user.role === "editor" || user.role === "admin");
}

export interface MediaAccessInput {
  mediaPath: string;
  /** Value of the `t` query parameter, if any. */
  token?: string | null;
  /** Loads the access fields of a book; null when it does not exist. */
  getBook: (bookId: string) => Promise<BookAccessFields | null>;
  /** Resolves the signed-in user. Only called when the answer depends on it. */
  getUser: () => Promise<Pick<User, "id" | "role"> | null>;
  /** Loads a recording, for files under books/<bookId>/rec/. Without it those files are staff only. */
  getRecording?: (recordingId: string) => Promise<Pick<Recording, "bookId" | "userId" | "status"> | null>;
}

export async function decideMediaAccess(input: MediaAccessInput): Promise<MediaAccess> {
  const bookId = mediaBookId(input.mediaPath);
  if (!bookId) return "public";

  const recordingId = mediaRecordingId(input.mediaPath);
  if (recordingId !== null) {
    const recording =
      ID_PATTERN.test(recordingId) && input.getRecording ? await input.getRecording(recordingId) : null;
    if (!recording || recording.bookId !== bookId) {
      return isStaff(await input.getUser()) ? "private" : "denied";
    }
    if (recording.status !== "approved") {
      const user = await input.getUser();
      return user && (isStaff(user) || user.id === recording.userId) ? "private" : "denied";
    }
    // Approved: the book decides, as for its own narration.
  }

  // A folder name that cannot be a book id belongs to no book.
  const book = ID_PATTERN.test(bookId) ? await input.getBook(bookId) : null;
  if (book?.status === "published") return "public";
  if (book && sameToken(input.token, book.shareToken)) return "private";

  const user = await input.getUser();
  if (!user) return "denied";
  if (isStaff(user)) return "private";
  return book && book.ownerId === user.id ? "private" : "denied";
}

// ---------------------------------------------------------------------------
// Book lookup with a short cache (Supabase mode)
// ---------------------------------------------------------------------------

/**
 * One page view requests many files of the same book. In Supabase mode each
 * lookup is a database query, so the access fields are remembered briefly.
 * The price: unpublishing a book or revoking its share link takes up to this
 * long to reach the media route. The local repository is not cached.
 */
export const MEDIA_ACCESS_CACHE_MS = 5000;
const MAX_CACHED_BOOKS = 2000;

interface AccessCacheGlobal {
  __mystoryMediaAccess?: Map<string, { at: number; book: BookAccessFields | null }>;
}
const cacheGlobal = globalThis as unknown as AccessCacheGlobal;

export function bookAccessLoader(
  repo: Pick<Repository, "kind" | "getBookById">,
  now: () => number = Date.now,
): (bookId: string) => Promise<BookAccessFields | null> {
  const load = async (bookId: string): Promise<BookAccessFields | null> => {
    const book = await repo.getBookById(bookId);
    return book ? { status: book.status, ownerId: book.ownerId, shareToken: book.shareToken } : null;
  };
  if (repo.kind !== "supabase") return load;

  const cache = (cacheGlobal.__mystoryMediaAccess ??= new Map());
  return async (bookId) => {
    const hit = cache.get(bookId);
    if (hit && now() - hit.at < MEDIA_ACCESS_CACHE_MS) return hit.book;
    const book = await load(bookId);
    if (cache.size >= MAX_CACHED_BOOKS) cache.clear();
    cache.set(bookId, { at: now(), book });
    return book;
  };
}
