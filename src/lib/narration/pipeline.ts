/**
 * The narration pipeline: text -> nikud -> speech -> stored audio + word timings.
 *
 * This file takes its dependencies as arguments and imports nothing that is
 * "server-only", so the CLI (scripts/narrate.ts) and the tests can use it
 * directly. The app uses the wrappers in ./index.ts.
 *
 * Rules:
 *  - A page is narrated once. It is skipped when its audio and word timings
 *    already match its text (see pageState), unless `force` is set.
 *  - A human recording is never replaced unless `overwriteRecorded` is set.
 *  - Demo (mock) audio is stored as audioSource "mock" and is replaced
 *    automatically once a real TTS provider is configured. Real audio is never
 *    replaced by demo audio while it still matches the text.
 *  - An existing textNikud is kept (it may have been corrected by hand). A new
 *    one is stored only when a real nikud provider returned vocalized text
 *    with the same word count.
 */
import { createHash } from "node:crypto";
import type { NikudProvider, TtsProvider } from "../ai/types";
import { withBookLock } from "../book-lock";
import { countWords, hasNikud, splitWords } from "../hebrew";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import { NotFoundError, type Repository } from "../repo/types";
import type { BookWithPages, Page, WordTiming } from "../types";
import { timingsMatchText } from "./align";
import type {
  BookNarrationSummary,
  NarrationOptions,
  PageNarrationResult,
  PageNarrationState,
} from "./types";

export interface NarrationDeps {
  repo: Repository;
  media: MediaStore;
  nikud: NikudProvider;
  tts: TtsProvider;
}

export interface BookNarrationOptions extends NarrationOptions {
  /** Zero-based page indexes to narrate; default all pages. */
  pages?: number[];
  /** Called after every page. */
  onPage?: (result: PageNarrationResult, done: number, total: number) => void;
  /** Stops before the next page when aborted. */
  signal?: AbortSignal;
}

/** Files written by this pipeline are named "narration-<page>-<hash>.<ext>". */
const NARRATION_FILE_PREFIX = "narration-";

/** The text that is spoken and highlighted: the vocalized text when it is usable. */
export function narrationText(page: Pick<Page, "text" | "textNikud">): string {
  if (page.textNikud && countWords(page.textNikud) === countWords(page.text)) return page.textNikud;
  return page.text;
}

/** True when the stored audio and word timings belong to the page's current text. */
export function isNarrationUpToDate(
  page: Pick<Page, "text" | "textNikud" | "audio" | "wordTimings">,
): boolean {
  return !!page.audio && timingsMatchText(page.wordTimings, narrationText(page));
}

export function pageState(page: Page): PageNarrationState {
  return {
    pageIndex: page.index,
    hasText: countWords(page.text) > 0,
    hasAudio: !!page.audio,
    ...(page.audio && page.audioSource ? { audioSource: page.audioSource } : {}),
    upToDate: page.audioSource === "recorded" ? !!page.audio : isNarrationUpToDate(page),
    hasNikud: !!page.textNikud && hasNikud(page.textNikud),
  };
}

// The read-modify-write of a book's pages takes the same per-book lock as the
// studio saves (see ../book-lock), so neither can overwrite the other.

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function narrationFileName(pageIndex: number, bytes: Uint8Array, contentType: string): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const number = String(pageIndex + 1).padStart(2, "0");
  return `${NARRATION_FILE_PREFIX}${number}-${hash}.${extensionForContentType(contentType)}`;
}

function isNarrationFile(bookId: string, mediaPath: string | undefined): mediaPath is string {
  return !!mediaPath && mediaPath.startsWith(`${bookMediaPrefix(bookId)}/${NARRATION_FILE_PREFIX}`);
}

/** Narrates one page of an already loaded book. Throws when a provider or the storage fails. */
async function narrateLoadedPage(
  deps: NarrationDeps,
  book: BookWithPages,
  page: Page,
  options: NarrationOptions,
): Promise<PageNarrationResult> {
  const base: PageNarrationResult = {
    bookId: book.id,
    pageIndex: page.index,
    status: "skipped",
    wordCount: countWords(page.text),
    nikudAdded: false,
    warnings: [],
  };

  if (base.wordCount === 0) return { ...base, reason: "empty" };
  if (page.audio && page.audioSource === "recorded" && !options.overwriteRecorded) {
    return { ...base, reason: "recorded", audio: page.audio, audioSource: "recorded" };
  }

  if (isNarrationUpToDate(page) && (await deps.media.get(page.audio as string)) !== null) {
    const existing = { audio: page.audio, ...(page.audioSource ? { audioSource: page.audioSource } : {}) };
    const isDemo = page.audioSource === "mock";
    if (deps.tts.isMock && !isDemo) return { ...base, ...existing, reason: "kept-real-audio" };
    const upgradeFromDemo = isDemo && !deps.tts.isMock;
    if (!options.force && !upgradeFromDemo) return { ...base, ...existing, reason: "up-to-date" };
  }

  // 1. Nikud. Keep a usable existing vocalization; otherwise ask the provider.
  let textNikud: string | undefined =
    page.textNikud && countWords(page.textNikud) === base.wordCount ? page.textNikud : undefined;
  let nikudAdded = false;
  if (page.textNikud && !textNikud) {
    base.warnings.push("the stored textNikud has a different word count than the text and was ignored");
  }
  if (!textNikud && !deps.nikud.isMock) {
    const vocalized = await deps.nikud.addNikud(page.text);
    if (vocalized.isMock || !hasNikud(vocalized.text)) {
      base.warnings.push("the nikud provider returned text without nikud");
    } else if (countWords(vocalized.text) !== base.wordCount) {
      base.warnings.push("the nikud provider changed the word count; its result was not stored");
    } else {
      textNikud = vocalized.text;
      nikudAdded = true;
    }
  }

  // 2. Speech.
  const spokenText = textNikud ?? page.text;
  const words = splitWords(spokenText);
  const style = options.style ?? book.hero?.narrationStyle;
  const notes = options.notes ?? book.hero?.narrationNotes;
  // request voice, then the book's chosen voice; otherwise the provider's own default (TTS_VOICE)
  const voice = options.voice ?? book.hero?.narrationVoice;
  const speech = await deps.tts.synthesize(spokenText, {
    ...(voice ? { voice } : {}),
    ...(options.speed ? { speed: options.speed } : {}),
    ...(style ? { style } : {}),
    ...(notes ? { notes } : {}),
  });
  if (speech.wordTimings.length !== words.length) {
    throw new Error(
      `TTS provider "${deps.tts.name}" returned ${speech.wordTimings.length} word timings for ${words.length} words`,
    );
  }
  if (speech.audio.byteLength === 0) throw new Error(`TTS provider "${deps.tts.name}" returned empty audio`);
  const wordTimings: WordTiming[] = speech.wordTimings.map((timing, i) => ({
    word: words[i],
    start: timing.start,
    end: Math.max(timing.start, timing.end),
  }));
  // Providers without word timings (Gemini) return ESTIMATED ones; the audio is still plain "tts".
  const audioSource = speech.isMock ? "mock" : "tts";

  // 3. Store the audio, then attach it to the page if the text is still the same.
  const audioPath = bookMediaPath(book.id, narrationFileName(page.index, speech.audio, speech.contentType));
  await deps.media.put(audioPath, speech.audio, speech.contentType);

  return withBookLock(book.id, async (): Promise<PageNarrationResult> => {
    const fresh = await deps.repo.getBookById(book.id);
    const current = fresh?.pages[page.index];
    const unchanged =
      !!fresh && !!current && current.text === page.text && (current.textNikud ?? "") === (page.textNikud ?? "");
    const stillReferenced = (path: string) => !!fresh && fresh.pages.some((p) => p.audio === path);

    if (!fresh || !current || !unchanged) {
      if (!stillReferenced(audioPath)) await deps.media.delete(audioPath);
      return { ...base, reason: "stale", warnings: [...base.warnings, "the page changed while it was narrated"] };
    }

    const pages = fresh.pages.map((p) => {
      if (p.index !== page.index) return p;
      const next: Page = { ...p, audio: audioPath, wordTimings, audioSource };
      // Only a newly produced vocalization is written; an existing textNikud is never touched.
      if (nikudAdded && textNikud) next.textNikud = textNikud;
      return next;
    });
    const saved = await deps.repo.replacePages(book.id, pages);

    const oldAudio = current.audio;
    if (isNarrationFile(book.id, oldAudio) && !saved.pages.some((p) => p.audio === oldAudio)) {
      await deps.media.delete(oldAudio).catch(() => undefined);
    }

    return {
      ...base,
      status: "narrated",
      audio: audioPath,
      audioSource,
      durationSeconds: speech.durationSeconds,
      nikudAdded,
    };
  });
}

/** Narrates one page (zero-based index). Throws NotFoundError for a missing book or page. */
export async function narratePageWith(
  deps: NarrationDeps,
  bookId: string,
  pageIndex: number,
  options: NarrationOptions = {},
): Promise<PageNarrationResult> {
  const book = await deps.repo.getBookById(bookId);
  if (!book) throw new NotFoundError(`book ${bookId}`);
  const page = book.pages[pageIndex];
  if (!page) throw new NotFoundError(`page ${pageIndex} of book ${bookId}`);
  return narrateLoadedPage(deps, book, page, options);
}

/**
 * Narrates every page of a book, one after the other. A page that fails is
 * reported with status "failed" and the run continues with the next page.
 */
export async function narrateBookWith(
  deps: NarrationDeps,
  bookId: string,
  options: BookNarrationOptions = {},
): Promise<BookNarrationSummary> {
  const book = await deps.repo.getBookById(bookId);
  if (!book) throw new NotFoundError(`book ${bookId}`);

  const wanted = options.pages ? new Set(options.pages) : null;
  const indexes = book.pages.map((page) => page.index).filter((index) => !wanted || wanted.has(index));

  const summary: BookNarrationSummary = {
    bookId,
    total: indexes.length,
    narrated: 0,
    skipped: 0,
    failed: 0,
    ttsProvider: deps.tts.name,
    nikudProvider: deps.nikud.name,
    ttsMock: deps.tts.isMock,
    nikudMock: deps.nikud.isMock,
    aborted: false,
    results: [],
  };

  for (const pageIndex of indexes) {
    if (options.signal?.aborted) {
      summary.aborted = true;
      break;
    }
    let result: PageNarrationResult;
    try {
      // Re-read the book for each page so earlier pages' writes and outside edits are seen.
      result = await narratePageWith(deps, bookId, pageIndex, options);
    } catch (err) {
      result = {
        bookId,
        pageIndex,
        status: "failed",
        wordCount: countWords(book.pages[pageIndex]?.text ?? ""),
        nikudAdded: false,
        warnings: [],
        error: errorMessage(err),
      };
    }
    summary.results.push(result);
    summary[result.status]++;
    options.onPage?.(result, summary.results.length, summary.total);
  }
  return summary;
}
