/**
 * Merging suggested book details into the book, client-safe and pure.
 *
 * Rules (the user's own words are never overwritten):
 *  - A field is FILLABLE when it is empty, an obvious placeholder title, or
 *    still exactly what the last automatic fill wrote (so rewriting the story
 *    can refresh details that nobody touched).
 *  - With `replaceAll` every suggested field is replaced, except credits.
 *  - Credits (author / illustrator) are filled only when empty, and only when
 *    the matching part was really made by AI (never for sample output).
 *  - License and source are never touched.
 */
import type { Book } from "../types";
import type { DetailField, DetailSuggestions } from "./details";

export type DetailsMeta = Pick<
  Book,
  "title" | "summary" | "author" | "illustrator" | "categories" | "tags" | "themes" | "discussionQuestions" | "coverImage"
>;

export type FilledField = DetailField | "author" | "illustrator";

/** What the last automatic fill wrote, per field; a field still equal to it is considered untouched. */
export type AutoFilled = Partial<Record<FilledField, string | string[]>>;

export const AI_AUTHOR_CREDIT = "נכתב בעזרת בינה מלאכותית";
export const AI_ILLUSTRATOR_CREDIT = "אויר בעזרת בינה מלאכותית";

const PLACEHOLDER_TITLES = new Set(["ספר חדש", "ספר בלי שם", "ספר ללא שם", "בלי שם", "ללא שם", "ללא כותרת", "untitled", "new book"]);

export function isPlaceholderTitle(title: string): boolean {
  const clean = title.replace(/\s+/g, " ").trim().toLowerCase();
  return clean.length === 0 || PLACEHOLDER_TITLES.has(clean);
}

const LABELS: Record<FilledField, string> = {
  title: "כותרת",
  summary: "תקציר",
  categories: "קטגוריות",
  themes: "ערכים",
  tags: "תגיות",
  discussionQuestions: "שאלות לשיחה",
  author: "כתיבה",
  illustrator: "איור",
};

function same(a: string | string[] | undefined, b: string | string[] | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isEmpty(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
}

export interface MergeResult {
  patch: Partial<DetailsMeta>;
  filled: FilledField[];
  /** The new "last written automatically" record, to keep for the next merge. */
  autoFilled: AutoFilled;
}

export function mergeDetails(options: {
  meta: DetailsMeta;
  suggestions: DetailSuggestions;
  autoFilled?: AutoFilled;
  /** Replace details that were already filled (credits are never replaced). */
  replaceAll?: boolean;
}): MergeResult {
  const { meta, suggestions, replaceAll = false } = options;
  const autoFilled: AutoFilled = { ...options.autoFilled };
  const patch: Partial<DetailsMeta> = {};
  const filled: FilledField[] = [];

  const consider = <K extends DetailField>(field: K, suggested: DetailsMeta[K] | undefined) => {
    if (suggested === undefined || isEmpty(suggested)) return;
    const current = meta[field];
    const fillable =
      replaceAll ||
      isEmpty(current) ||
      (field === "title" && isPlaceholderTitle(current as string)) ||
      same(current, autoFilled[field]);
    if (!fillable || same(current, suggested)) return;
    (patch as Record<string, unknown>)[field] = suggested;
    autoFilled[field] = suggested;
    filled.push(field);
  };
  consider("title", suggestions.title);
  consider("summary", suggestions.summary);
  consider("categories", suggestions.categories);
  consider("themes", suggestions.themes);
  consider("tags", suggestions.tags);
  consider("discussionQuestions", suggestions.discussionQuestions);
  return { patch, filled, autoFilled };
}

/** Credit lines for the parts AI made: only into empty fields. */
export function mergeCredits(options: {
  meta: Pick<DetailsMeta, "author" | "illustrator">;
  aiWrote?: boolean;
  aiIllustrated?: boolean;
}): { patch: Partial<Pick<DetailsMeta, "author" | "illustrator">>; filled: FilledField[] } {
  const patch: Partial<Pick<DetailsMeta, "author" | "illustrator">> = {};
  const filled: FilledField[] = [];
  if (options.aiWrote && options.meta.author.trim().length === 0) {
    patch.author = AI_AUTHOR_CREDIT;
    filled.push("author");
  }
  if (options.aiIllustrated && options.meta.illustrator.trim().length === 0) {
    patch.illustrator = AI_ILLUSTRATOR_CREDIT;
    filled.push("illustrator");
  }
  return { patch, filled };
}

/** "מילאנו אוטומטית: כותרת, תקציר, 4 תגיות". */
export function describeFilled(filled: FilledField[], patch: Partial<DetailsMeta>): string {
  if (filled.length === 0) return "";
  const parts = filled.map((field) => {
    const value = patch[field as keyof DetailsMeta];
    if (field === "tags" && Array.isArray(value)) return value.length === 1 ? "תגית אחת" : `${value.length} תגיות`;
    if (field === "discussionQuestions" && Array.isArray(value)) return value.length === 1 ? "שאלה לשיחה" : `${value.length} שאלות לשיחה`;
    if (field === "author") return "קרדיט כתיבה";
    if (field === "illustrator") return "קרדיט איור";
    return LABELS[field];
  });
  return `מילאנו אוטומטית: ${parts.join(", ")}.`;
}

/** How complete the details are, for the stage card. */
export function detailsCompleteness(meta: DetailsMeta): { done: number; total: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["כותרת", !isPlaceholderTitle(meta.title)],
    ["תקציר", meta.summary.trim().length > 0],
    ["קטגוריה", meta.categories.length > 0],
    ["תגיות", meta.tags.length > 0],
    ["שאלות לשיחה", meta.discussionQuestions.length > 0],
  ];
  return { done: checks.filter(([, ok]) => ok).length, total: checks.length, missing: checks.filter(([, ok]) => !ok).map(([n]) => n) };
}
