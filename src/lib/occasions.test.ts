import { describe, expect, it } from "vitest";
import {
  HOLIDAYS,
  OCCASIONS,
  PARASHOT,
  bookMatchesOccasion,
  getOccasion,
  groupBooksByOccasion,
  occasionBookIds,
  occasionDescription,
  occasionHref,
  occasionIndexable,
  occasionSearchTitle,
  parashotByBook,
} from "./occasions";
import { hasNikud } from "./hebrew";

const SLUG = /^[a-z]+(-[a-z]+)*$/;

describe("occasion slugs", () => {
  it("has the 54 parashot in the order of the cycle", () => {
    expect(PARASHOT).toHaveLength(54);
    expect(PARASHOT[0].slug).toBe("bereshit");
    expect(PARASHOT[53].slug).toBe("vezot-haberacha");
    expect(parashotByBook().map((group) => group.parashot.length)).toEqual([12, 11, 10, 10, 11]);
  });

  it("has the main holidays and shabbat", () => {
    expect(HOLIDAYS.map((holiday) => holiday.slug)).toEqual([
      "shabbat",
      "rosh-hashana",
      "yom-kippur",
      "sukkot",
      "simchat-torah",
      "hanukkah",
      "tu-bishvat",
      "purim",
      "pesach",
      "lag-baomer",
      "shavuot",
    ]);
  });

  it("slugs are unique latin URL segments within each kind", () => {
    for (const list of [PARASHOT, HOLIDAYS]) {
      const slugs = list.map((occasion) => occasion.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) expect(slug).toMatch(SLUG);
    }
    expect(getOccasion("parasha", "noach")?.name).toBe("נח");
    expect(getOccasion("holiday", "hanukkah")?.name).toBe("חנוכה");
    expect(getOccasion("holiday", "noach")).toBeUndefined();
    expect(occasionHref(getOccasion("parasha", "lech-lecha")!)).toBe("/parasha/lech-lecha");
    expect(occasionHref(getOccasion("holiday", "pesach")!)).toBe("/holidays/pesach");
  });

  it("titles and descriptions are written as people search, without nikud", () => {
    expect(occasionSearchTitle(getOccasion("parasha", "noach")!)).toBe("סיפור לפרשת נח לילדים");
    expect(occasionSearchTitle(getOccasion("holiday", "hanukkah")!)).toBe("סיפורים לחנוכה לילדים");
    for (const occasion of OCCASIONS) {
      expect(hasNikud(occasionSearchTitle(occasion)), occasion.slug).toBe(false);
      expect(hasNikud(occasionDescription(occasion)), occasion.slug).toBe(false);
    }
  });
});

describe("matching books", () => {
  it("matches the tags the original stories use, ignoring gershayim and nikud", () => {
    const noach = getOccasion("parasha", "noach")!;
    const tuBishvat = getOccasion("holiday", "tu-bishvat")!;
    expect(bookMatchesOccasion({ tags: ["פרשת נח", "חיות"] }, noach)).toBe(true);
    expect(bookMatchesOccasion({ tags: ["נח"] }, noach)).toBe(false);
    expect(bookMatchesOccasion({ tags: ["ט״ו בשבט"] }, tuBishvat)).toBe(true);
    expect(bookMatchesOccasion({ tags: ['ט"ו בשבט'] }, tuBishvat)).toBe(true);
    expect(bookMatchesOccasion({ tags: ["טו בשבט"] }, tuBishvat)).toBe(true);
    expect(bookMatchesOccasion({ tags: ["פֶּסַח"] }, getOccasion("holiday", "pesach")!)).toBe(true);
    expect(bookMatchesOccasion({ tags: ["פרשת שלח לך"] }, getOccasion("parasha", "shelach")!)).toBe(true);
  });

  it("groups books by tag and by the season of a collection", () => {
    const books = [
      { id: "a", tags: ["פרשת מקץ", "חנוכה"] },
      { id: "b", tags: ["פרשת נח"] },
      { id: "c", tags: ["סביבון"] },
    ];
    const collections = [
      { season: "hanukkah", bookIds: ["c", "draft-not-published"] },
      { season: undefined, bookIds: ["b"] },
    ];
    const grouped = groupBooksByOccasion(books, collections);
    expect(occasionBookIds(grouped, getOccasion("parasha", "miketz")!)).toEqual(["a"]);
    expect(occasionBookIds(grouped, getOccasion("parasha", "noach")!)).toEqual(["b"]);
    expect(occasionBookIds(grouped, getOccasion("holiday", "hanukkah")!).sort()).toEqual(["a", "c"]);
    expect(occasionBookIds(grouped, getOccasion("holiday", "purim")!)).toEqual([]);
  });
});

describe("noindex rule", () => {
  it("indexes an occasion page only once it has a book", () => {
    expect(occasionIndexable(0)).toBe(false);
    expect(occasionIndexable(1)).toBe(true);
    expect(occasionIndexable(12)).toBe(true);
  });
});
