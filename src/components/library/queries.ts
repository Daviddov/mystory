/**
 * Data loading for the public library. Server only.
 * Everything here lists PUBLISHED books only (the repository default, and
 * stated explicitly so a later change of the default cannot leak drafts).
 */
import "server-only";
import { groupBooksByOccasion } from "@/lib/occasions";
import { getRepo } from "@/lib/repo";
import type { BookFilter } from "@/lib/repo/types";
import { CATEGORIES, tagSlug, type TaxonomyItem } from "@/lib/taxonomy";
import type { Book, Collection, User } from "@/lib/types";
import { toBookFilter, totalPages, type LibraryQuery } from "./filters";
import { rankSimilar } from "./recommend";
import { normalizeSeason, sortCollectionsBySeason } from "./seasons";

const PUBLISHED = "published" as const;
const SHELF_SIZE = 12;

export interface BookListing {
  books: Book[];
  total: number;
  /** The page actually shown (clamped to the last page). */
  page: number;
  pages: number;
  /** Epoch milliseconds of the request, for "new" badges. */
  now: number;
}

/** One page of a listing. A page number past the end shows the last page instead of an empty one. */
export async function listLibraryBooks(query: LibraryQuery, base: BookFilter = {}): Promise<BookListing> {
  const repo = await getRepo();
  let result = await repo.listBooks(toBookFilter(query, base));
  const pages = totalPages(result.total);
  let page = query.page;
  if (page > pages) {
    page = pages;
    result = await repo.listBooks(toBookFilter({ ...query, page }, base));
  }
  return { books: result.books, total: result.total, page, pages, now: Date.now() };
}

export interface ViewerListing {
  /** The query actually applied: the "read" filter is dropped without a signed-in viewer. */
  query: LibraryQuery;
  listing: BookListing;
  /** Books the viewer finished (empty without a viewer), for the "read" check mark. */
  readIds: Set<string>;
}

/** One page of the all-books listing, honouring the per-user "read" filter. */
export async function listBooksForViewer(parsed: LibraryQuery, viewer: User | null): Promise<ViewerListing> {
  // "Read" is per user: without a signed-in viewer the filter does not apply.
  const query = viewer ? parsed : { ...parsed, read: undefined };
  const readIds = viewer
    ? new Set(
        (await (await getRepo()).listProgress(viewer.id).catch(() => [])).filter((p) => p.completed).map((p) => p.bookId),
      )
    : new Set<string>();
  const listing =
    query.read === "read" && readIds.size === 0
      ? { books: [], total: 0, page: 1, pages: 1, now: Date.now() }
      : await listLibraryBooks(
          query,
          query.read === "read" ? { ids: [...readIds] } : query.read === "unread" ? { excludeIds: [...readIds] } : {},
        );
  return { query, listing, readIds };
}

export interface CollectionWithBooks {
  collection: Collection;
  /** Published books of the collection, in the collection's order. */
  books: Book[];
}

async function publishedInOrder(bookIds: readonly string[]): Promise<Book[]> {
  if (bookIds.length === 0) return [];
  const repo = await getRepo();
  const { books } = await repo.listBooks({ status: PUBLISHED, ids: [...bookIds] });
  const byId = new Map(books.map((book) => [book.id, book]));
  return bookIds.flatMap((id) => {
    const book = byId.get(id);
    return book ? [book] : [];
  });
}

/** All collections that have at least one published book, in-season ones first. */
export async function listCollectionsWithBooks(now: Date): Promise<CollectionWithBooks[]> {
  const repo = await getRepo();
  const collections = sortCollectionsBySeason(await repo.listCollections(), now);
  const filled = await Promise.all(
    collections.map(async (collection) => ({ collection, books: await publishedInOrder(collection.bookIds) })),
  );
  return filled.filter((entry) => entry.books.length > 0);
}

export async function getCollectionWithBooks(slug: string): Promise<CollectionWithBooks | null> {
  const repo = await getRepo();
  const collection = await repo.getCollectionBySlug(slug);
  if (!collection) return null;
  return { collection, books: await publishedInOrder(collection.bookIds) };
}

export interface CategoryShelf {
  category: TaxonomyItem;
  books: Book[];
  total: number;
}

export interface HomeData {
  bookOfTheWeek: Book | null;
  /** False when no book of the week is set and the most read book is shown instead. */
  bookOfTheWeekIsChosen: boolean;
  newest: Book[];
  popular: Book[];
  shelves: CategoryShelf[];
  collections: CollectionWithBooks[];
  totalBooks: number;
  /** Epoch milliseconds of the request, for "new" badges. */
  now: number;
}

export async function getHomeData(): Promise<HomeData> {
  const repo = await getRepo();
  const now = new Date();
  const [settings, newest, popular, shelves, collections] = await Promise.all([
    repo.getSettings(),
    repo.listBooks({ status: PUBLISHED, sort: "new", limit: SHELF_SIZE }),
    repo.listBooks({ status: PUBLISHED, sort: "popular", limit: SHELF_SIZE }),
    Promise.all(
      CATEGORIES.map(async (category): Promise<CategoryShelf> => {
        const result = await repo.listBooks({
          status: PUBLISHED,
          category: category.slug,
          sort: "popular",
          limit: SHELF_SIZE,
        });
        return { category, books: result.books, total: result.total };
      }),
    ),
    listCollectionsWithBooks(now),
  ]);

  let bookOfTheWeek: Book | null = null;
  if (settings.bookOfTheWeekId) {
    const chosen = await repo.listBooks({ status: PUBLISHED, ids: [settings.bookOfTheWeekId], limit: 1 });
    bookOfTheWeek = chosen.books[0] ?? null;
  }
  const bookOfTheWeekIsChosen = bookOfTheWeek !== null;
  if (!bookOfTheWeek) bookOfTheWeek = popular.books[0] ?? null;

  return {
    bookOfTheWeek,
    bookOfTheWeekIsChosen,
    newest: newest.books,
    popular: popular.books,
    shelves: shelves.filter((shelf) => shelf.books.length > 0),
    collections,
    totalBooks: newest.total,
    now: now.getTime(),
  };
}

/**
 * "More like this": candidates come from the book's age group and categories,
 * then are ranked by shared categories, themes and tags.
 */
export async function getRecommendations(book: Book, limit: number = 6): Promise<Book[]> {
  const repo = await getRepo();
  const common = { status: PUBLISHED, excludeIds: [book.id], sort: "popular" as const, limit: 40 };
  const lists = await Promise.all([
    repo.listBooks({ ...common, ageGroup: book.ageGroup }),
    ...book.categories.slice(0, 4).map((category) => repo.listBooks({ ...common, category })),
  ]);
  return rankSimilar(
    book,
    lists.flatMap((list) => list.books),
    limit,
  );
}

export interface TagCount {
  label: string;
  count: number;
}

/**
 * Tags used by published books, most used first.
 * NOTE: reads every published book (without pages); fine for a library of
 * hundreds, should become a repository aggregate if the library grows large.
 */
export async function listTagCounts(limit: number = 24): Promise<TagCount[]> {
  const repo = await getRepo();
  const { books } = await repo.listBooks({ status: PUBLISHED });
  const counts = new Map<string, TagCount>();
  for (const book of books) {
    for (const tag of book.tags) {
      const key = tagSlug(tag);
      if (key === "") continue;
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: tag.trim(), count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "he"))
    .slice(0, limit);
}


/** The most read published books. */
export async function listPopularBooks(limit: number = SHELF_SIZE): Promise<Book[]> {
  const repo = await getRepo();
  const { books } = await repo.listBooks({ status: PUBLISHED, sort: "popular", limit });
  return books;
}

/**
 * Ids of the published books of every parasha and holiday page (see lib/occasions.ts).
 * Reads every published book (without pages), like listTagCounts().
 */
export async function listOccasionBookIds(): Promise<Map<string, string[]>> {
  const repo = await getRepo();
  const [{ books }, collections] = await Promise.all([repo.listBooks({ status: PUBLISHED }), repo.listCollections()]);
  return groupBooksByOccasion(
    books,
    collections.map((collection) => ({ season: normalizeSeason(collection.season), bookIds: collection.bookIds })),
  );
}
