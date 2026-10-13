/**
 * The Book Dash catalogue for the admin console: fetched from GitHub on
 * demand, kept in memory for a few minutes, and joined with what this site
 * already imported. Server only.
 */
import "server-only";
import { missingCreditRoles, type CreditRole } from "../credits";
import type { Repository } from "../repo/types";
import { bookLanguage, type BookStatus } from "../types";
import { BookDashClient, bookDashBookId, type BookDashCatalogue, type BookDashCatalogueEntry } from "./bookdash";

/** The listing costs one of 60 unauthenticated GitHub API requests an hour, so it is reused for a while. */
const CACHE_MS = 10 * 60 * 1000;

interface CatalogueGlobal {
  __mystoryBookDashCatalogue?: { at: number; value: BookDashCatalogue };
}
const cacheGlobal = globalThis as unknown as CatalogueGlobal;

export function bookDashClient(): BookDashClient {
  return new BookDashClient({ githubToken: process.env.GITHUB_TOKEN });
}

export async function cachedBookDashCatalogue(
  options: { refresh?: boolean } = {},
): Promise<BookDashCatalogue & { fetchedAt: string }> {
  const hit = cacheGlobal.__mystoryBookDashCatalogue;
  if (hit && !options.refresh && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.value, fetchedAt: new Date(hit.at).toISOString() };
  }
  const value = await bookDashClient().catalogue();
  // An incomplete listing (rate limited) is not kept, so the next request tries again.
  if (value.complete) cacheGlobal.__mystoryBookDashCatalogue = { at: Date.now(), value };
  return { ...value, fetchedAt: new Date().toISOString() };
}

export interface BookDashCatalogueRow extends BookDashCatalogueEntry {
  /** The local copy, when the book was imported. */
  local?: {
    id: string;
    slug: string;
    title: string;
    status: BookStatus;
    /** True once the book is in Hebrew. */
    translated: boolean;
    missingCredits: CreditRole[];
  };
}

/** Catalogue entries with the import and translation state of each book. One repository query. */
export async function withLocalState(
  repo: Repository,
  entries: BookDashCatalogueEntry[],
): Promise<BookDashCatalogueRow[]> {
  if (entries.length === 0) return [];
  const { books } = await repo.listBooks({ status: "any", ids: entries.map((entry) => bookDashBookId(entry.slug)) });
  const byId = new Map(books.map((book) => [book.id, book]));
  return entries.map((entry) => {
    const book = byId.get(bookDashBookId(entry.slug));
    if (!book) return entry;
    return {
      ...entry,
      local: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        status: book.status,
        translated: bookLanguage(book) === "he",
        missingCredits: missingCreditRoles(book),
      },
    };
  });
}
