/**
 * Narration entry point. Server only.
 *
 *   await narratePage(bookId, 0);                 // one page, zero-based
 *   await narrateBook(bookId, { force: true });   // every page
 *
 * Providers come from "@/lib/ai": the mocks unless NIKUD_PROVIDER / TTS_PROVIDER
 * are set. With the mock TTS the stored audio is silence, labelled
 * audioSource "mock". These functions do NOT check permissions; the caller does
 * (see src/app/api/narration).
 */
import "server-only";
import { getNikudProvider, getTtsProvider } from "../ai";
import { getMediaStore } from "../media";
import { getRepo } from "../repo";
import {
  narrateBookWith,
  narratePageWith,
  type BookNarrationOptions,
  type NarrationDeps,
} from "./pipeline";
import type { BookNarrationSummary, NarrationOptions, PageNarrationResult } from "./types";

export * from "./types";
export { alignWords, timingsMatchText, type CharacterAlignment } from "./align";
export { isNarrationUpToDate, narrationText, pageState, type BookNarrationOptions } from "./pipeline";

export async function getNarrationDeps(): Promise<NarrationDeps> {
  const [repo, media, nikud, tts] = await Promise.all([
    getRepo(),
    getMediaStore(),
    getNikudProvider(),
    getTtsProvider(),
  ]);
  return { repo, media, nikud, tts };
}

/** Narrates one page (zero-based index). Idempotent unless `force` is set. */
export async function narratePage(
  bookId: string,
  pageIndex: number,
  options: NarrationOptions = {},
): Promise<PageNarrationResult> {
  return narratePageWith(await getNarrationDeps(), bookId, pageIndex, options);
}

/** Narrates every page of a book. Pages that are already narrated are skipped unless `force` is set. */
export async function narrateBook(
  bookId: string,
  options: BookNarrationOptions = {},
): Promise<BookNarrationSummary> {
  return narrateBookWith(await getNarrationDeps(), bookId, options);
}

export interface VocalizeResult {
  text: string;
  /** True when no nikud service is configured: `text` is the input, unchanged. */
  isMock: boolean;
  provider: string;
}

/** Adds nikud to arbitrary text (for the editor). */
export async function vocalize(text: string): Promise<VocalizeResult> {
  const provider = await getNikudProvider();
  const result = await provider.addNikud(text);
  return { text: result.text, isMock: result.isMock, provider: provider.name };
}
