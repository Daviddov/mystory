import { describe, expect, it } from "vitest";
import {
  appendItems,
  encodeScope,
  isListingPageResponse,
  listingApiUrl,
  parseScope,
  scopeForBase,
  type ListingItem,
  type ListingScope,
} from "./infinite";

const item = (id: string, isNew = false): ListingItem => ({ book: { id } as ListingItem["book"], isNew });

describe("listing scopes", () => {
  it("round-trips every kind", () => {
    const scopes: ListingScope[] = [
      { kind: "books" },
      { kind: "search" },
      { kind: "age", value: "3-5" },
      { kind: "category", value: "animals" },
      { kind: "theme", value: "patience" },
      { kind: "time", value: "10" },
      { kind: "tag", value: "סבא וסבתא" },
      { kind: "parasha", value: "noach" },
      { kind: "holiday", value: "hanukkah" },
    ];
    for (const scope of scopes) {
      const parsed = parseScope(encodeScope(scope));
      expect(parsed).toEqual(scope);
    }
  });

  it("rejects unknown kinds and values", () => {
    expect(parseScope(null)).toBeNull();
    expect(parseScope("")).toBeNull();
    expect(parseScope("admin")).toBeNull();
    expect(parseScope("books:x")).toBeNull();
    expect(parseScope("age:99")).toBeNull();
    expect(parseScope("category:nope")).toBeNull();
    expect(parseScope("tag:")).toBeNull();
    expect(parseScope(`tag:${"א".repeat(61)}`)).toBeNull();
    expect(parseScope("holiday:../../etc")).toBeNull();
  });

  it("tells the scope of a browse page from its base filter", () => {
    expect(scopeForBase({ ageGroup: "0-2" })).toEqual({ kind: "age", value: "0-2" });
    expect(scopeForBase({ category: "animals" })).toEqual({ kind: "category", value: "animals" });
    expect(scopeForBase({ tag: "גשם" })).toEqual({ kind: "tag", value: "גשם" });
    expect(scopeForBase({ ids: ["a"] })).toBeNull();
    expect(scopeForBase({})).toBeNull();
  });
});

describe("listingApiUrl", () => {
  it("keeps the listing query, adds the scope and the page", () => {
    const url = new URL(listingApiUrl({ kind: "tag", value: "גשם" }, { sort: "popular", age: "3-5", q: undefined }, 3), "http://x");
    expect(url.pathname).toBe("/api/library");
    expect(url.searchParams.get("scope")).toBe("tag:גשם");
    expect(url.searchParams.get("sort")).toBe("popular");
    expect(url.searchParams.get("age")).toBe("3-5");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("q")).toBe(false);
  });
});

describe("appendItems", () => {
  it("appends in order and skips books already shown", () => {
    const merged = appendItems([item("a"), item("b")], [item("b"), item("c"), item("c"), item("d")]);
    expect(merged.map((entry) => entry.book.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns a copy when nothing is new", () => {
    const shown = [item("a")];
    const merged = appendItems(shown, [item("a")]);
    expect(merged).toEqual(shown);
    expect(merged).not.toBe(shown);
  });
});

describe("isListingPageResponse", () => {
  it("accepts a listing page and rejects anything else", () => {
    expect(isListingPageResponse({ items: [item("a")], page: 2, pages: 3, total: 50 })).toBe(true);
    expect(isListingPageResponse({ items: [], page: 2, pages: 3, total: 50 })).toBe(true);
    expect(isListingPageResponse({ error: "x" })).toBe(false);
    expect(isListingPageResponse({ items: [{}], page: 2, pages: 3, total: 50 })).toBe(false);
    expect(isListingPageResponse(null)).toBe(false);
  });
});
