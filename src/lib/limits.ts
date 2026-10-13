/**
 * The one set of book size limits. The studio, both importers (pages and zip
 * package) and their request schemas all read these, so nothing can be
 * imported that the studio then refuses to save. Client-safe.
 */
export const BOOK_LIMITS = {
  /** Most pages in one book. */
  pages: 60,
  /** Longest text of one page, in characters. */
  pageTextChars: 3000,
  /** Longest vocalized text of one page (nikud adds combining marks to every letter). */
  pageNikudChars: 3000 * 3,
  /** Most books one account may own. A guard against runaway scripts, not a product limit. */
  booksPerOwner: 300,
} as const;

export const TOO_MANY_BOOKS_MESSAGE = "הגעתם למספר הספרים המרבי בחשבון. מחקו ספר ישן כדי ליצור חדש.";
