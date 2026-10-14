/**
 * What a book still needs before it can enter the library, for the publishing
 * pipeline screen. Client-safe.
 */
import { countWords, hasNikud } from "@/lib/hebrew";
import { narrationStale, publishProblems } from "@/lib/studio/shared";
import type { AgeGroup, BookStatus, BookWithPages } from "@/lib/types";

/** Short labels of the publication checklist codes (see publishProblems). */
const PROBLEM_LABELS: Record<string, string> = {
  language: "לא בעברית",
  translator: "חסר מתרגם",
  title: "חסר שם",
  summary: "חסר תקציר",
  author: "חסר מחבר",
  license: "חסר רישיון",
  source: "חסר מקור",
  categories: "חסרה קטגוריה",
  pages: "אין עמודים",
  "blank-page": "עמוד ריק",
  "nikud-mismatch": "ניקוד לא תואם",
  "narration-stale": "הקראה לא מעודכנת",
  "no-text": "אין טקסט",
};

export interface BookReadiness {
  /** Distinct short labels of what blocks publication. Empty when the book may be published. */
  missing: string[];
  /** Pages that have text (the pages narration applies to). */
  textPages: number;
  /** Text pages with a real, up-to-date narration (synthesized or recorded). */
  narratedPages: number;
  /** Text pages with vocalized text. */
  nikudPages: number;
  /** Characters of the text pages that still wait for narration. */
  charsToNarrate: number;
}

/** One line of the pipeline table. Plain data, passed from the server page to the client board. */
export interface PipelineRow extends BookReadiness {
  id: string;
  slug: string;
  title: string;
  author: string;
  status: BookStatus;
  ageGroup: AgeGroup;
  categories: string[];
  pageCount: number;
}

export function bookReadiness(book: BookWithPages): BookReadiness {
  const codes = new Set(publishProblems(book).map((problem) => problem.code));
  // The admin publish rule also asks for a source (see missingPublishCredits).
  if (!book.source.trim()) codes.add("source");

  let textPages = 0;
  let narratedPages = 0;
  let nikudPages = 0;
  let charsToNarrate = 0;
  for (const page of book.pages) {
    if (countWords(page.text) === 0) continue;
    textPages += 1;
    if (page.textNikud && hasNikud(page.textNikud)) nikudPages += 1;
    if (page.audio && page.audioSource !== "mock" && !narrationStale(page)) narratedPages += 1;
    else charsToNarrate += page.text.length;
  }
  return {
    missing: [...codes].map((code) => PROBLEM_LABELS[code] ?? code),
    textPages,
    narratedPages,
    nikudPages,
    charsToNarrate,
  };
}

export function pipelineRow(book: BookWithPages): PipelineRow {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
    status: book.status,
    ageGroup: book.ageGroup,
    categories: book.categories,
    pageCount: book.pages.length,
    ...bookReadiness(book),
  };
}

/** Every text page has a real narration. A book without text has nothing to narrate. */
export function isNarrated(row: Pick<BookReadiness, "textPages" | "narratedPages">): boolean {
  return row.narratedPages >= row.textPages;
}

export const PIPELINE_VIEWS = ["details", "narration", "ready", "unpublished"] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];

export const PIPELINE_VIEW_LABELS: Record<PipelineView, string> = {
  details: "חסרים פרטים",
  narration: "חסרה הקראה",
  ready: "מוכנים לפרסום",
  unpublished: "כל מה שלא פורסם",
};

export function inPipelineView(row: PipelineRow, view: PipelineView): boolean {
  const unpublished = row.status !== "published";
  switch (view) {
    case "details":
      return unpublished && row.missing.length > 0;
    case "narration":
      // Published books too: a book in the library without narration is still unfinished.
      return !isNarrated(row);
    case "ready":
      return unpublished && row.missing.length === 0 && isNarrated(row);
    case "unpublished":
      return unpublished;
  }
}
