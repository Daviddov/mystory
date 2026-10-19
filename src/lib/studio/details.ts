/**
 * Studio "book details" suggestions: title, summary, categories, themes, tags
 * and discussion questions, written from the SAVED pages of the book with one
 * text call (the same librarian prompt the wizard uses). Nothing is written
 * into the book here: the editor merges the suggestions into the empty fields
 * (see auto-details.ts). Sample (mock) text is never returned as a suggestion.
 *
 * Every dependency is injected, so this file must not import "server-only" modules.
 */
import type { TextProvider } from "../ai/types";
import { cleanFreeText } from "../generation/input";
import { MetadataSchema, metadataPrompt } from "../generation/prompts";
import { CATEGORY_SLUGS, THEME_SLUGS } from "../taxonomy";
import type { AgeGroup } from "../types";

export const DETAIL_FIELDS = ["title", "summary", "categories", "themes", "tags", "discussionQuestions"] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];

export interface DetailSuggestions {
  title?: string;
  summary?: string;
  categories?: string[];
  themes?: string[];
  tags?: string[];
  discussionQuestions?: string[];
}

export interface DetailsResult {
  suggestions: DetailSuggestions;
  isMock: boolean;
}

export class DetailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetailsError";
  }
}

function clampList(values: string[], max: number, maxLength: number): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanFreeText(value).slice(0, maxLength).trim();
    if (cleaned) seen.add(cleaned);
    if (seen.size >= max) break;
  }
  return Array.from(seen);
}

export async function suggestDetails(
  deps: { text: TextProvider },
  book: { ageGroup: AgeGroup; categories: string[]; pages: { text: string }[] },
  fields?: readonly string[],
): Promise<DetailsResult> {
  const pages = book.pages.map((page) => page.text.trim()).filter((text) => text.length > 0);
  if (pages.length === 0) throw new DetailsError("אין עדיין טקסט בספר. כתבו את הסיפור, ואז נמלא את הפרטים.");

  const llm = await deps.text.generate({
    ...metadataPrompt(
      { ageGroup: book.ageGroup, category: book.categories.find((slug) => CATEGORY_SLUGS.includes(slug)) },
      pages.map((text) => ({ text, illustrationPrompt: "" })),
    ),
    schema: MetadataSchema,
    schemaName: "book_metadata",
    mockData: { title: "", summary: "", tags: [], themes: [], categories: [], discussionQuestions: [] },
  });
  // Sample text must never reach a real book.
  if (llm.isMock) return { suggestions: {}, isMock: true };

  const want = (field: DetailField) => !fields || fields.length === 0 || fields.includes(field);
  const data = llm.data;
  const suggestions: DetailSuggestions = {};
  const title = cleanFreeText(data.title).slice(0, 120);
  if (want("title") && title) suggestions.title = title;
  const summary = data.summary.replace(/\s+/g, " ").trim().slice(0, 600);
  if (want("summary") && summary) suggestions.summary = summary;
  const categories = Array.from(new Set(data.categories.filter((slug) => CATEGORY_SLUGS.includes(slug)))).slice(0, 3);
  if (want("categories") && categories.length > 0) suggestions.categories = categories;
  const themes = Array.from(new Set(data.themes.filter((slug) => THEME_SLUGS.includes(slug)))).slice(0, 3);
  if (want("themes") && themes.length > 0) suggestions.themes = themes;
  const tags = clampList(data.tags, 6, 30);
  if (want("tags") && tags.length > 0) suggestions.tags = tags;
  const questions = clampList(data.discussionQuestions, 4, 200);
  if (want("discussionQuestions") && questions.length > 0) suggestions.discussionQuestions = questions;
  return { suggestions, isMock: false };
}
