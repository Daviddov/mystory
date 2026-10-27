/**
 * The pages InfiniteBookGrid loads after the first one. Server only.
 *
 * Mirrors what each listing page renders on the server, so page 2 fetched by
 * the browser holds the same books (and the same "חדש" / "read" flags) as
 * page 2 opened through ?page=2:
 *   - browse pages (BrowseView): the page's fixed filter + sort + age;
 *   - /search: the text + sort;
 *   - /books: every filter, including the viewer's "read" filter.
 */
import "server-only";
import { getOccasion, occasionBookIds } from "@/lib/occasions";
import { toPublicBook } from "@/lib/public-book";
import type { BookFilter } from "@/lib/repo/types";
import type { Book, User } from "@/lib/types";
import { parseLibraryQuery, type LibraryQuery, type RawSearchParams } from "./filters";
import type { ListingItem, ListingPageResponse, ListingScope } from "./infinite";
import { listBooksForViewer, listLibraryBooks, listOccasionBookIds, type BookListing } from "./queries";
import { isNewBook } from "./recommend";

/** Cards of a listing as sent to the browser: public fields only, plus the flags. */
export function toListingItems(books: readonly Book[], now: number, readIds?: ReadonlySet<string>): ListingItem[] {
  return books.map((book) => ({
    book: toPublicBook(book),
    isNew: isNewBook(book, now),
    ...(readIds?.has(book.id) ? { read: true } : {}),
  }));
}

/** The fixed filter of a browse page, or null when the scope names nothing (unknown holiday...). */
async function browseBase(scope: ListingScope): Promise<BookFilter | null> {
  switch (scope.kind) {
    case "age":
      return { ageGroup: scope.value };
    case "category":
      return { category: scope.value };
    case "theme":
      return { theme: scope.value };
    case "time":
      return { timeBucket: scope.value };
    case "tag":
      return { tag: scope.value };
    case "parasha":
    case "holiday": {
      const occasion = getOccasion(scope.kind, scope.value);
      if (!occasion) return null;
      return { ids: occasionBookIds(await listOccasionBookIds(), occasion) };
    }
    default:
      return null;
  }
}

export interface LoadedListingPage {
  body: ListingPageResponse;
  /** The answer depends on who asks (the "read" filter or check marks): do not share it in caches. */
  personal: boolean;
}

/**
 * One page of a listing, or null when the scope is not valid.
 * A page past the end gives no items (listLibraryBooks would repeat the last page).
 */
export async function loadListingPage(
  scope: ListingScope,
  raw: RawSearchParams,
  getViewer: () => Promise<User | null>,
): Promise<LoadedListingPage | null> {
  const parsed = parseLibraryQuery(raw);
  let listing: BookListing;
  let readIds: ReadonlySet<string> | undefined;
  let personal = false;

  if (scope.kind === "books") {
    const viewer = await getViewer();
    const result = await listBooksForViewer(parsed, viewer);
    listing = result.listing;
    readIds = result.readIds;
    personal = viewer !== null;
  } else if (scope.kind === "search") {
    if (!parsed.q) return { body: { items: [], page: parsed.page, pages: 1, total: 0 }, personal };
    listing = await listLibraryBooks({ q: parsed.q, sort: parsed.sort, page: parsed.page });
  } else {
    const base = await browseBase(scope);
    if (!base) return null;
    // As in BrowseView: only sort, page and (except on the age pages) age are honoured.
    const query: LibraryQuery = {
      sort: parsed.sort,
      page: parsed.page,
      age: scope.kind === "age" ? undefined : parsed.age,
    };
    listing = await listLibraryBooks(query, base);
  }

  const pastEnd = listing.page !== parsed.page;
  return {
    body: {
      items: pastEnd ? [] : toListingItems(listing.books, listing.now, readIds),
      page: parsed.page,
      pages: listing.pages,
      total: listing.total,
    },
    personal,
  };
}
