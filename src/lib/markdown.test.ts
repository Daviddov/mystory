import { describe, expect, it } from "vitest";
import { stripNikud } from "./hebrew";
import { bookMarkdown, listingMarkdown, mdLink, mdText } from "./markdown";
import type { BookWithPages } from "./types";

const book: BookWithPages = {
  id: "b1",
  slug: "snail",
  title: "הַשַּׁבְּלוּל [הקטן]",
  summary: "שַׁבְּלוּל יוֹצֵא לַדֶּרֶךְ.",
  author: "דנה",
  illustrator: "",
  license: "CC BY 4.0",
  source: "https://example.org/snail",
  ageGroup: "3-5",
  readingMinutes: 3,
  coverImage: "",
  status: "published",
  ownerId: "system",
  categories: ["animals"],
  tags: ["גשם"],
  themes: ["patience"],
  discussionQuestions: ["לָמָּה הַשַּׁבְּלוּל מְחַכֶּה?", " "],
  origin: "manual",
  viewCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  pages: [
    { index: 0, text: "שַׁבְּלוּל קָטָן\nזוֹחֵל לְאַט" },
    { index: 1, text: "- סוֹף" },
  ],
};

describe("markdown", () => {
  it("writes text without nikud, keeping verse lines and escaping block syntax", () => {
    expect(mdText("שׁוּרָה\nשְׁנִיָּה\n\n# כּוֹתֶרֶת")).toBe("שורה  \nשניה\n\n\\# כותרת");
  });

  it("makes absolute links with a safe label", () => {
    expect(mdLink("א [ב]", "/book/x")).toMatch(/^\[א \\\[ב\\\]\]\(https?:\/\/[^)]+\/book\/x\)$/);
  });

  it("writes a book with its story, questions and license", () => {
    const md = bookMarkdown(book);
    expect(md).toMatch(/^# השבלול \[הקטן\]\n\n> שבלול יוצא לדרך\./);
    expect(md).toContain("- כתיבה: דנה");
    expect(md).toContain("### עמוד 1\n\nשבלול קטן  \nזוחל לאט");
    expect(md).toContain("### עמוד 2\n\n\\- סוף");
    expect(md).toContain("## שאלות לשיחה\n\n1. למה השבלול מחכה?\n\n");
    expect(md).toContain("[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)");
    expect(md).toMatch(/\/read\/snail/);
    expect(stripNikud(md)).toBe(md);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("writes a listing, or says it is empty", () => {
    expect(listingMarkdown({ title: "חיות", books: [book] })).toMatch(/## ספרים \(1\)\n\n- \[השבלול \\\[הקטן\\\]\]\([^)]+\/book\/snail\): שבלול יוצא לדרך\./);
    expect(listingMarkdown({ title: "חיות", books: [] })).toContain("עוד אין כאן ספרים.");
  });
});
