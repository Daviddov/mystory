/**
 * Studio stage "write the story": the idea (and optionally the hero's name)
 * becomes the pages of the book, in the house voice (Dr. Seuss mechanisms, see
 * generation/seuss.ts). Independent of every other stage: it needs no hero, no
 * pictures, no narration, and it writes nothing into the book. The editor puts
 * the returned pages in and saves, as with a pasted story.
 *
 *   outline -> pages -> second-pass review (one revision on "major")
 *
 * Every dependency is injected, so this file must not import "server-only" modules.
 */
import type { TextProvider } from "../ai/types";
import { checkAgeFit } from "../generation/pipeline";
import { cleanFreeText, type WizardInput } from "../generation/input";
import { mockOutline, mockPages, mockReview } from "../generation/mock-story";
import {
  OutlineSchema,
  ReviewSchema,
  StoryPagesSchema,
  outlinePrompt,
  pagesPrompt,
  reviewPrompt,
  revisionPrompt,
  type Review,
  type StoryPage,
} from "../generation/prompts";
import type { AgeGroup } from "../types";
import { MAX_PAGES } from "./shared";

export interface WriteStoryRequest {
  idea: string;
  ageGroup: AgeGroup;
  /** The hero's first name; empty lets the writer invent one. */
  heroName?: string;
  heroGender?: "boy" | "girl";
  category?: string;
}

export interface WrittenStory {
  pages: StoryPage[];
  /** True when the text came from the sample (mock) writer. */
  isMock: boolean;
  /** Issues the reviewer still saw (minor ones); empty when the story is clean. */
  notes: string[];
}

export class WriteStoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteStoryError";
  }
}

const RANK = { ok: 0, minor: 1, major: 2 } as const;

function toInput(request: WriteStoryRequest): WizardInput {
  return {
    childName: cleanFreeText(request.heroName ?? "") || "הגיבור",
    childGender: request.heroGender ?? "boy",
    hobbies: [],
    appearance: "",
    idea: cleanFreeText(request.idea),
    ageGroup: request.ageGroup,
    category: request.category ?? "adventures",
    style: "watercolor",
  };
}

function clean(pages: StoryPage[]): StoryPage[] {
  return pages
    .map((page) => ({
      text: page.text.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim(),
      illustrationPrompt: page.illustrationPrompt.replace(/\s+/g, " ").trim().slice(0, 600),
    }))
    .filter((page) => page.text.length > 0)
    .slice(0, MAX_PAGES);
}

export async function writeStory(deps: { text: TextProvider }, request: WriteStoryRequest): Promise<WrittenStory> {
  const input = toInput(request);
  let isMock = false;

  const outlineResult = await deps.text.generate({
    ...outlinePrompt(input),
    schema: OutlineSchema,
    schemaName: "story_outline",
    mockData: mockOutline(input),
  });
  if (outlineResult.isMock) isMock = true;

  const writeResult = await deps.text.generate({
    ...pagesPrompt(input, outlineResult.data),
    schema: StoryPagesSchema,
    schemaName: "story_pages",
    mockData: { pages: mockPages(input) },
  });
  if (writeResult.isMock) isMock = true;
  let pages = clean(writeResult.data.pages);
  if (pages.length === 0) throw new WriteStoryError("לא הצלחנו לכתוב סיפור. נסו שוב.");

  const review = async (current: StoryPage[]): Promise<Review> => {
    const llm = await deps.text.generate({
      ...reviewPrompt(input, current),
      schema: ReviewSchema,
      schemaName: "story_review",
      mockData: mockReview(),
    });
    if (llm.isMock) isMock = true;
    const fit = checkAgeFit(current, input.ageGroup);
    return {
      verdict: RANK[llm.data.verdict] >= RANK[fit.verdict] ? llm.data.verdict : fit.verdict,
      issues: [...llm.data.issues, ...fit.issues],
    };
  };

  let verdict = await review(pages);
  if (verdict.verdict === "major") {
    const revised = await deps.text.generate({
      ...revisionPrompt(input, pages, verdict.issues),
      schema: StoryPagesSchema,
      schemaName: "story_pages",
      mockData: { pages: mockPages(input) },
    });
    if (revised.isMock) isMock = true;
    pages = clean(revised.data.pages);
    verdict = await review(pages);
    if (verdict.verdict === "major") {
      throw new WriteStoryError("הסיפור שנכתב לא עבר את בדיקת האיכות וההתאמה לילדים. נסו לנסח את הרעיון אחרת.");
    }
  }

  return { pages, isMock, notes: verdict.issues.map((issue) => issue.description) };
}
