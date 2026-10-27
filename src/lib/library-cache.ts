/**
 * Cache of the public library pages.
 *
 * The library pages (/, /books, /book/[slug], /age, /category, /theme, /time,
 * /tag, /collections, /parasha, /holidays, /listen) are static for signed-out visitors (force-static) and
 * kept fresh two ways:
 *   - time-based: each page is rebuilt in the background at most every
 *     10 minutes (`export const revalidate = 600` on each page), which is what
 *     picks up view counts and changes written outside the app (scripts,
 *     direct database edits);
 *   - on demand: every repository write that changes what the library shows
 *     (a published book created, edited, published, unpublished or deleted;
 *     collections; site settings) calls revalidateLibrary(). See
 *     withLibraryRevalidation in src/lib/repo/index.ts.
 *
 * Signed-in visitors and filtered listings are rendered per request by the
 * dynamic twin in src/app/live (src/proxy.ts decides).
 */
import { revalidatePath } from "next/cache";
import type { Repository } from "./repo/types";
import type { Book } from "./types";

/**
 * Marks every cached page stale, so the next visit renders it again. The whole
 * site, not just the book's page: a book also appears on the home page, the
 * listings, collections and in other books' "more like this" row.
 *
 * Outside a Next.js request (scripts, tests) or during a render there is no
 * cache to clear and Next.js throws; the time-based revalidation catches up.
 */
export function revalidateLibrary(): void {
  try {
    revalidatePath("/", "layout");
  } catch {
    // Not in a Server Function or Route Handler.
  }
}

const isPublished = (book: Pick<Book, "status">) => book.status === "published";

/**
 * Wraps a repository so that writes affecting the public library revalidate
 * the cached pages. Edits of drafts and private books do not: no cached page
 * shows them. Reads and personal data (favorites, progress, views) pass through.
 */
export function withLibraryRevalidation(repo: Repository): Repository {
  const after =
    <A extends unknown[], R>(write: (...args: A) => Promise<R>, affects: (result: R, ...args: A) => boolean = () => true) =>
    async (...args: A): Promise<R> => {
      const result = await write(...args);
      if (affects(result, ...args)) revalidateLibrary();
      return result;
    };

  const wrapped: Partial<Repository> = {
    createBook: after(repo.createBook.bind(repo), (book) => isPublished(book)),
    // A status change in either direction (publish / unpublish), or any edit of a published book.
    updateBook: after(repo.updateBook.bind(repo), (book, _id, patch) => isPublished(book) || patch.status !== undefined),
    // The status before the delete is gone; deletes are rare, so always.
    deleteBook: after(repo.deleteBook.bind(repo)),
    replacePages: after(repo.replacePages.bind(repo), (book) => isPublished(book)),
    createCollection: after(repo.createCollection.bind(repo)),
    updateCollection: after(repo.updateCollection.bind(repo)),
    deleteCollection: after(repo.deleteCollection.bind(repo)),
    setSettings: after(repo.setSettings.bind(repo)),
    // The cached book page lists readers' comments; they are rare, so a new or deleted one refreshes it at once.
    addComment: after(repo.addComment.bind(repo)),
    deleteComment: after(repo.deleteComment.bind(repo)),
  };

  return new Proxy(repo, {
    get(target, property, receiver) {
      if (typeof property === "string" && Object.hasOwn(wrapped, property)) {
        return wrapped[property as keyof Repository];
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
