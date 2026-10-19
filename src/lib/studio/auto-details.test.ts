import { describe, expect, it } from "vitest";
import {
  AI_AUTHOR_CREDIT,
  AI_ILLUSTRATOR_CREDIT,
  describeFilled,
  detailsCompleteness,
  isPlaceholderTitle,
  mergeCredits,
  mergeDetails,
  type DetailsMeta,
} from "./auto-details";

const empty: DetailsMeta = {
  title: "ספר חדש",
  summary: "",
  author: "",
  illustrator: "",
  categories: [],
  tags: [],
  themes: [],
  discussionQuestions: [],
  coverImage: "",
};
const suggestions = {
  title: "הירח של דנה",
  summary: "תקציר קצר.",
  categories: ["adventures"],
  themes: ["curiosity"],
  tags: ["ירח", "חתול"],
  discussionQuestions: ["מה הרגשת?"],
};

describe("mergeDetails", () => {
  it("fills everything into an empty book and records it", () => {
    const result = mergeDetails({ meta: empty, suggestions });
    expect(result.patch).toEqual(suggestions);
    expect(result.filled).toEqual(["title", "summary", "categories", "themes", "tags", "discussionQuestions"]);
    expect(result.autoFilled.title).toBe("הירח של דנה");
  });

  it("recognises placeholder titles", () => {
    expect(isPlaceholderTitle("  ספר   חדש ")).toBe(true);
    expect(isPlaceholderTitle("")).toBe(true);
    expect(isPlaceholderTitle("הדרקון הקטן")).toBe(false);
  });

  it("never overwrites what the user wrote", () => {
    const meta = { ...empty, title: "הכותרת שלי", summary: "שלי", tags: ["אחד"], categories: ["family"], discussionQuestions: ["ש?"] };
    const result = mergeDetails({ meta, suggestions });
    expect(result.patch).toEqual({ themes: ["curiosity"] });
    expect(result.filled).toEqual(["themes"]);
  });

  it("refreshes a detail that is still exactly what the last auto-fill wrote", () => {
    const first = mergeDetails({ meta: empty, suggestions });
    const meta = { ...empty, ...first.patch };
    const second = mergeDetails({
      meta,
      suggestions: { title: "כותרת אחרת", tags: ["חדש"] },
      autoFilled: first.autoFilled,
    });
    expect(second.patch).toEqual({ title: "כותרת אחרת", tags: ["חדש"] });
    // After the user edits the title it is no longer refreshed.
    const edited = mergeDetails({
      meta: { ...meta, title: "הכותרת שהקלדתי" },
      suggestions: { title: "עוד כותרת" },
      autoFilled: first.autoFilled,
    });
    expect(edited.patch).toEqual({});
  });

  it("replaceAll replaces filled details but never credits", () => {
    const meta = { ...empty, title: "שלי", summary: "שלי", author: "דנה", tags: ["אחד"] };
    const result = mergeDetails({ meta, suggestions, replaceAll: true });
    expect(result.patch).toMatchObject({ title: "הירח של דנה", summary: "תקציר קצר.", tags: ["ירח", "חתול"] });
    expect(result.patch).not.toHaveProperty("author");
  });

  it("ignores empty suggestions and identical values", () => {
    const meta = { ...empty, title: "הירח של דנה" };
    const result = mergeDetails({ meta, suggestions: { title: "הירח של דנה", tags: [], summary: "" }, replaceAll: true });
    expect(result.filled).toEqual([]);
  });
});

describe("mergeCredits", () => {
  it("fills only empty credits for the parts AI made", () => {
    expect(mergeCredits({ meta: empty, aiWrote: true }).patch).toEqual({ author: AI_AUTHOR_CREDIT });
    expect(mergeCredits({ meta: empty, aiIllustrated: true }).patch).toEqual({ illustrator: AI_ILLUSTRATOR_CREDIT });
    expect(mergeCredits({ meta: empty }).filled).toEqual([]);
    const result = mergeCredits({ meta: { author: "דנה", illustrator: "" }, aiWrote: true, aiIllustrated: true });
    expect(result.patch).toEqual({ illustrator: AI_ILLUSTRATOR_CREDIT });
  });
});

describe("describeFilled and detailsCompleteness", () => {
  it("lists what was filled with counts", () => {
    const text = describeFilled(["title", "summary", "tags"], { tags: ["א", "ב", "ג", "ד"] });
    expect(text).toBe("מילאנו אוטומטית: כותרת, תקציר, 4 תגיות.");
    expect(describeFilled([], {})).toBe("");
  });

  it("counts complete fields and names the missing ones", () => {
    expect(detailsCompleteness(empty)).toEqual({
      done: 0,
      total: 5,
      missing: ["כותרת", "תקציר", "קטגוריה", "תגיות", "שאלות לשיחה"],
    });
    expect(detailsCompleteness({ ...empty, ...suggestions }).missing).toEqual([]);
  });
});
