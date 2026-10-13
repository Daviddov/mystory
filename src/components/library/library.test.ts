import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { Book } from "@/lib/types";
import {
  PAGE_SIZE,
  bookCountLabel,
  buildHref,
  describeActiveFilters,
  hasActiveFilters,
  hrefWith,
  pageWindow,
  parseLibraryQuery,
  toBookFilter,
  toParams,
  totalPages,
} from "./filters";
import {
  getCollectionWithBooks,
  getHomeData,
  getRecommendations,
  listCollectionsWithBooks,
  listLibraryBooks,
  listTagCounts,
} from "./queries";
import { isNewBook, rankSimilar, similarityScore } from "./recommend";
import { currentSeasons, isInSeason, normalizeSeason, seasonInfo, sortCollectionsBySeason } from "./seasons";

describe("parseLibraryQuery", () => {
  it("returns defaults for empty input", () => {
    expect(parseLibraryQuery(undefined)).toEqual({ sort: "new", page: 1 });
    expect(parseLibraryQuery({})).toEqual({ sort: "new", page: 1 });
  });

  it("keeps valid values", () => {
    expect(
      parseLibraryQuery({
        age: "3-5",
        category: "animals",
        theme: "courage",
        time: "10",
        tag: "  יום   הולדת ",
        q: " שבלול ",
        sort: "popular",
        page: "3",
      }),
    ).toEqual({
      age: "3-5",
      category: "animals",
      theme: "courage",
      time: "10",
      tag: "יום הולדת",
      q: "שבלול",
      sort: "popular",
      page: 3,
    });
  });

  it("drops invalid values instead of throwing", () => {
    const query = parseLibraryQuery({
      age: "9-12",
      category: "nope",
      theme: "<script>",
      time: "7",
      sort: "updated",
      page: "-4",
      q: "",
      tag: "   ",
    });
    expect(query).toEqual({ sort: "new", page: 1 });
  });

  it("takes the first value of a repeated parameter and limits the text length", () => {
    const query = parseLibraryQuery({ age: ["0-2", "6-8"], q: "א".repeat(500), page: "abc" });
    expect(query.age).toBe("0-2");
    expect(query.q).toHaveLength(100);
    expect(query.page).toBe(1);
  });
});

describe("toBookFilter", () => {
  it("maps the query and paginates", () => {
    const filter = toBookFilter(parseLibraryQuery({ age: "6-8", time: "20", q: "מפה", page: "2", sort: "title" }));
    expect(filter).toMatchObject({
      ageGroup: "6-8",
      timeBucket: "20",
      query: "מפה",
      sort: "title",
      limit: PAGE_SIZE,
      offset: PAGE_SIZE,
      status: "published",
    });
  });

  it("lets the page's own filter win and never takes the status from the caller", () => {
    const filter = toBookFilter(parseLibraryQuery({ category: "humor" }), { category: "animals", status: "any" });
    expect(filter.category).toBe("animals");
    expect(filter.status).toBe("published");
  });
});

describe("links", () => {
  it("omits defaults and empty values", () => {
    expect(toParams({ sort: "new", page: 1 })).toEqual({});
    expect(buildHref("/books", toParams({ sort: "new", page: 1 }))).toBe("/books");
    expect(buildHref("/books", { age: "3-5", q: "" })).toBe("/books?age=3-5");
  });

  it("returns to the first page when a filter changes, but not when the page changes", () => {
    const query = parseLibraryQuery({ age: "3-5", page: "4", sort: "popular" });
    expect(hrefWith("/books", query, { category: "animals" })).toBe("/books?age=3-5&category=animals&sort=popular");
    expect(hrefWith("/books", query, { page: 5 })).toBe("/books?age=3-5&sort=popular&page=5");
    expect(hrefWith("/books", query, { age: undefined })).toBe("/books?sort=popular");
  });

  it("encodes Hebrew text", () => {
    const href = hrefWith("/search", parseLibraryQuery({}), { q: "סבא וסבתא" });
    expect(new URL(href, "http://x").searchParams.get("q")).toBe("סבא וסבתא");
  });
});

describe("listing helpers", () => {
  it("counts pages", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(PAGE_SIZE)).toBe(1);
    expect(totalPages(PAGE_SIZE + 1)).toBe(2);
  });

  it("builds a pager window with gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });

  it("describes active filters in Hebrew", () => {
    const query = parseLibraryQuery({ age: "0-2", category: "bedtime", time: "5", theme: "family", tag: "ירח", q: "כוכב" });
    expect(hasActiveFilters(query)).toBe(true);
    expect(describeActiveFilters(query).map((filter) => filter.key)).toEqual([
      "q",
      "age",
      "category",
      "time",
      "theme",
      "tag",
    ]);
    expect(describeActiveFilters(query).find((filter) => filter.key === "category")?.label).toBe("לפני השינה");
    expect(hasActiveFilters(parseLibraryQuery({ sort: "popular", page: "2" }))).toBe(false);
  });

  it("labels book counts", () => {
    expect(bookCountLabel(0)).toBe("אין ספרים");
    expect(bookCountLabel(1)).toBe("ספר אחד");
    expect(bookCountLabel(7)).toBe("7 ספרים");
  });
});

function fakeBook(overrides: Partial<Book> & { id: string }): Book {
  return {
    slug: overrides.id,
    title: overrides.id,
    summary: "",
    author: "",
    illustrator: "",
    license: "",
    source: "",
    ageGroup: "3-5",
    readingMinutes: 5,
    coverImage: "",
    status: "published",
    ownerId: "system",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: [],
    origin: "manual",
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("recommendations", () => {
  const book = fakeBook({ id: "a", categories: ["animals", "nature"], themes: ["courage"], tags: ["גשם"] });

  it("scores shared attributes", () => {
    expect(similarityScore(book, fakeBook({ id: "b", ageGroup: "6-8", readingMinutes: 30 }))).toBe(0);
    expect(
      similarityScore(book, fakeBook({ id: "c", categories: ["animals"], themes: ["courage"], tags: ["גשם"] })),
    ).toBe(3 + 2 + 1.5 + 1 + 0.5);
  });

  it("ranks, removes the book itself and duplicates, and drops unrelated books", () => {
    const close = fakeBook({ id: "close", categories: ["animals", "nature"] });
    const far = fakeBook({ id: "far", ageGroup: "6-8", readingMinutes: 30, categories: ["nature"] });
    const unrelated = fakeBook({ id: "none", ageGroup: "0-2", readingMinutes: 30 });
    const ranked = rankSimilar(book, [far, book, close, close, unrelated]);
    expect(ranked.map((b) => b.id)).toEqual(["close", "far"]);
    expect(rankSimilar(book, [far, close], 1).map((b) => b.id)).toEqual(["close"]);
  });

  it("breaks ties by view count", () => {
    const quiet = fakeBook({ id: "quiet", viewCount: 1 });
    const loud = fakeBook({ id: "loud", viewCount: 50 });
    expect(rankSimilar(book, [quiet, loud]).map((b) => b.id)).toEqual(["loud", "quiet"]);
  });

  it("detects new books", () => {
    const now = Date.parse("2026-10-13T00:00:00.000Z");
    expect(isNewBook({ publishedAt: "2026-10-05T00:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z" }, now)).toBe(true);
    expect(isNewBook({ publishedAt: "2026-09-01T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(false);
    expect(isNewBook({ createdAt: "not a date" }, now)).toBe(false);
  });
});

describe("seasons", () => {
  it("maps months to weather seasons", () => {
    expect(currentSeasons(new Date("2026-01-15T12:00:00Z"))).toContain("winter");
    expect(currentSeasons(new Date("2026-04-15T12:00:00Z"))).toContain("spring");
    expect(currentSeasons(new Date("2026-07-15T12:00:00Z"))).toContain("summer");
    expect(currentSeasons(new Date("2026-10-13T12:00:00Z"))).toContain("autumn");
  });

  it("adds holidays from the Hebrew calendar", () => {
    // 25 Kislev 5787 is 5 December 2026.
    expect(currentSeasons(new Date("2026-12-06T12:00:00Z"))).toContain("hanukkah");
    // 15 Nisan 5786 is 2 April 2026.
    expect(currentSeasons(new Date("2026-04-02T12:00:00Z"))).toContain("pesach");
  });

  it("normalizes keys and labels them", () => {
    expect(normalizeSeason(" Winter ")).toBe("winter");
    expect(normalizeSeason("Chanukah")).toBe("hanukkah");
    expect(normalizeSeason("")).toBeUndefined();
    expect(seasonInfo("winter")?.label).toBe("חורף");
    expect(seasonInfo("סוף שנה")?.label).toBe("סוף שנה");
    expect(seasonInfo(undefined)).toBeUndefined();
  });

  it("puts in-season collections first and keeps the rest in order", () => {
    const january = new Date("2026-01-15T12:00:00Z");
    const list = [{ id: 1 }, { id: 2, season: "summer" }, { id: 3, season: "winter" }];
    expect(sortCollectionsBySeason(list, january).map((c) => c.id)).toEqual([3, 1, 2]);
    expect(isInSeason({ season: "winter" }, january)).toBe(true);
    expect(isInSeason({}, january)).toBe(false);
  });
});

describe("library queries", () => {
  let data: TempData;

  beforeEach(async () => {
    data = await createTempData({ setEnv: true });
    const { repo } = data;
    await repo.createBook({
      id: "pub-a",
      title: "Alpha",
      slug: "alpha",
      ownerId: "system",
      status: "published",
      ageGroup: "3-5",
      categories: ["animals"],
      themes: ["courage"],
      tags: ["גשם", "גינה"],
      viewCount: 5,
    });
    await repo.createBook({
      id: "pub-b",
      title: "Beta",
      slug: "beta",
      ownerId: "system",
      status: "published",
      ageGroup: "3-5",
      categories: ["animals", "nature"],
      tags: ["גשם"],
      viewCount: 50,
    });
    await repo.createBook({
      id: "pub-c",
      title: "Gamma",
      slug: "gamma",
      ownerId: "system",
      status: "published",
      ageGroup: "6-8",
      readingMinutes: 30,
      categories: ["humor"],
      viewCount: 1,
    });
    for (const status of ["draft", "private", "pending"] as const) {
      await repo.createBook({
        id: `hidden-${status}`,
        title: `Hidden ${status}`,
        slug: `hidden-${status}`,
        ownerId: "u_parent",
        status,
        ageGroup: "3-5",
        categories: ["animals"],
        tags: ["סודי"],
        viewCount: 999,
      });
    }
    await repo.createCollection({
      id: "col-1",
      slug: "mixed",
      title: "Mixed",
      description: "",
      bookIds: ["hidden-private", "pub-b", "missing", "pub-a"],
    });
    await repo.createCollection({ id: "col-2", slug: "only-hidden", title: "Hidden", description: "", bookIds: ["hidden-draft"] });
  });

  afterEach(async () => {
    await data.cleanup();
  });

  it("lists only published books, whatever the query says", async () => {
    const listing = await listLibraryBooks(parseLibraryQuery({ category: "animals", sort: "popular" }));
    expect(listing.books.map((book) => book.id)).toEqual(["pub-b", "pub-a"]);
    expect(listing.total).toBe(2);

    const forced = await listLibraryBooks(parseLibraryQuery({}), { status: "any" });
    expect(forced.books.map((book) => book.id).sort()).toEqual(["pub-a", "pub-b", "pub-c"]);
  });

  it("clamps a page number past the end", async () => {
    const listing = await listLibraryBooks(parseLibraryQuery({ page: "99" }));
    expect(listing.page).toBe(1);
    expect(listing.books).toHaveLength(3);
  });

  it("builds the home page data without unpublished books", async () => {
    await data.repo.setSettings({ bookOfTheWeekId: "hidden-private" });
    let home = await getHomeData();
    // An unpublished book of the week is ignored; the most read published book stands in.
    expect(home.bookOfTheWeek?.id).toBe("pub-b");
    expect(home.bookOfTheWeekIsChosen).toBe(false);
    expect(home.totalBooks).toBe(3);
    expect(home.popular.map((book) => book.id)).toEqual(["pub-b", "pub-a", "pub-c"]);
    expect(home.shelves.map((shelf) => shelf.category.slug)).toEqual(["animals", "nature", "humor"]);
    expect(home.shelves.flatMap((shelf) => shelf.books).every((book) => book.status === "published")).toBe(true);
    expect(home.collections.map((entry) => entry.collection.slug)).toEqual(["mixed"]);

    await data.repo.setSettings({ bookOfTheWeekId: "pub-c" });
    home = await getHomeData();
    expect(home.bookOfTheWeek?.id).toBe("pub-c");
    expect(home.bookOfTheWeekIsChosen).toBe(true);
  });

  it("keeps the collection order and hides unpublished or missing books", async () => {
    const found = await getCollectionWithBooks("mixed");
    expect(found?.books.map((book) => book.id)).toEqual(["pub-b", "pub-a"]);
    expect((await getCollectionWithBooks("only-hidden"))?.books).toEqual([]);
    expect(await getCollectionWithBooks("nope")).toBeNull();
    expect((await listCollectionsWithBooks(new Date())).map((entry) => entry.collection.id)).toEqual(["col-1"]);
  });

  it("recommends similar published books only", async () => {
    const book = await data.repo.getBookById("pub-a");
    const similar = await getRecommendations(book!);
    expect(similar.map((b) => b.id)).toEqual(["pub-b"]);
  });

  it("counts tags of published books only", async () => {
    expect(await listTagCounts()).toEqual([
      { label: "גשם", count: 2 },
      { label: "גינה", count: 1 },
    ]);
  });
});
