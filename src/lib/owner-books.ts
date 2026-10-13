/**
 * The per-account book cap, enforced wherever a user's book is created: the
 * studio, the pages import and the package import. No "server-only" import so
 * tests can call it with a temp repository.
 */
import { BOOK_LIMITS, TOO_MANY_BOOKS_MESSAGE } from "./limits";
import type { Repository } from "./repo/types";
import { SYSTEM_OWNER_ID } from "./types";

/** The account already owns the most books it may. `message` is Hebrew and safe to show. */
export class BookCapError extends Error {
  readonly status = 409;

  constructor() {
    super(TOO_MANY_BOOKS_MESSAGE);
    this.name = "BookCapError";
  }
}

/** Throws BookCapError when `ownerId` may not create another book. The site's own library is exempt. */
export async function assertOwnerCanAddBook(repo: Pick<Repository, "listBooks">, ownerId: string): Promise<void> {
  if (ownerId === SYSTEM_OWNER_ID) return;
  const { total } = await repo.listBooks({ ownerId, status: "any", limit: 1 });
  if (total >= BOOK_LIMITS.booksPerOwner) throw new BookCapError();
}
