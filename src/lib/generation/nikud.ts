/**
 * The nikud step of the story pipeline: every page is vocalized (Gemini, Dicta
 * when it fails), then a second model call proofreads the whole vocalized
 * story at once, since a word's nikud depends on the pages around it.
 *
 * A page whose nikud could not be made is left without it (the narration
 * pipeline tries again). A proofreader's correction is used only when it
 * changed vowel points and nothing else.
 */
import type { AiUsage, NikudProvider, TextRequest } from "../ai/types";
import { hasNikud, sameLetters } from "../hebrew";
import { NikudReviewSchema, nikudReviewPrompt, type NikudReview } from "./prompts";

export interface StoryNikudDeps {
  nikud: NikudProvider;
  /** Runs a text request with the pipeline's own provider. Absent: no proofreading. */
  ask?: <T>(request: TextRequest<T>) => Promise<T>;
  addUsage?: (usage: AiUsage | undefined) => void;
  log?: (message: string) => void;
}

export interface StoryNikud {
  /** Vocalized text per page, `undefined` where none could be made. */
  texts: (string | undefined)[];
  /** Pages the proofreader corrected. */
  corrected: number;
  /** Pages left without nikud. */
  missing: number;
}

const CONCURRENCY = 3;

export async function vocalizeStory(deps: StoryNikudDeps, pages: string[]): Promise<StoryNikud> {
  const log = deps.log ?? (() => {});
  if (deps.nikud.isMock) return { texts: pages.map(() => undefined), corrected: 0, missing: pages.length };

  const texts: (string | undefined)[] = pages.map(() => undefined);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pages.length) }, async () => {
      while (next < pages.length) {
        const index = next++;
        try {
          const result = await deps.nikud.addNikud(pages[index]);
          deps.addUsage?.(result.usage);
          if (!result.isMock && hasNikud(result.text) && sameLetters(pages[index], result.text)) texts[index] = result.text;
        } catch (err) {
          log(`[nikud] page ${index + 1} failed: ${err instanceof Error ? err.name : "error"}`);
        }
      }
    }),
  );

  let corrected = 0;
  if (deps.ask && texts.some((text) => text !== undefined)) {
    try {
      const draft = texts.map((text, i) => text ?? pages[i]);
      const review: NikudReview = await deps.ask({
        ...nikudReviewPrompt(draft),
        schema: NikudReviewSchema,
        schemaName: "nikud_review",
        temperature: 0.1,
        mockData: { pages: draft.map((text, i) => ({ page: i + 1, text })) },
      });
      for (const { page, text } of review.pages) {
        const index = page - 1;
        if (index < 0 || index >= pages.length) continue;
        const fixed = text.trim();
        if (fixed === texts[index] || !hasNikud(fixed) || !sameLetters(pages[index], fixed)) continue;
        texts[index] = fixed;
        corrected++;
      }
    } catch (err) {
      // The first vocalization stands.
      log(`[nikud] proofreading failed: ${err instanceof Error ? err.name : "error"}`);
    }
  }

  return { texts, corrected, missing: texts.filter((text) => text === undefined).length };
}
