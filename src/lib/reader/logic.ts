/**
 * Pure reader logic: page turning direction, text and word-timing selection,
 * resume position. Client-safe, no DOM access, fully unit tested.
 */
import { hasNikud, splitWords, timingWordsMatch } from "../hebrew";
import { toPublicBookWithPages, type PublicBookWithPages } from "../public-book";
import { bookLanguage, type AgeGroup, type BookLanguage, type BookWithPages, type Page, type WordTiming } from "../types";

/** The book shape the player needs. Fields a reader must never see are left out (see ../public-book). */
export type PlayerBook = PublicBookWithPages;

/** Removes owner-only fields (share token, owner id, review note, cost) before a book is sent to the browser. */
export function toPlayerBook(book: BookWithPages): PlayerBook {
  return toPublicBookWithPages(book);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Story text sizes in rem; the reader writes the chosen one into --story-font-size. */
export const FONT_SIZES_REM = [1.25, 1.5, 1.875, 2.25, 2.75] as const;

/** Younger readers get bigger letters until the family picks a size. */
export function defaultFontStep(ageGroup: AgeGroup): number {
  return ageGroup === "6-8" ? 1 : 2;
}

export const PLAYBACK_RATES = [0.75, 1, 1.25] as const;
export const SLEEP_TIMER_MINUTES = [5, 10, 15, 30] as const;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Page turning
// ---------------------------------------------------------------------------

export type ReaderAction = "next" | "prev" | "first" | "last" | "toggle-audio" | "fullscreen";
export type ReadingDirection = "rtl" | "ltr";

/**
 * Keyboard mapping. In a right-to-left book the next page is on the LEFT, so
 * the left arrow goes forward.
 */
export function keyToAction(key: string, direction: ReadingDirection = "rtl"): ReaderAction | null {
  switch (key) {
    case "ArrowLeft":
      return direction === "rtl" ? "next" : "prev";
    case "ArrowRight":
      return direction === "rtl" ? "prev" : "next";
    case "PageDown":
    case "Enter":
      return "next";
    case "PageUp":
    case "Backspace":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case " ":
    case "Spacebar":
      return "toggle-audio";
    case "f":
    case "F":
    case "כ": // the same physical key on a Hebrew keyboard layout
      return "fullscreen";
    default:
      return null;
  }
}

/**
 * Swipe mapping. `dx` and `dy` are finger travel in pixels (positive dx =
 * moved to the right). Like turning a Hebrew paper book, dragging the page
 * to the right reveals the next page.
 */
export function swipeToAction(
  dx: number,
  dy: number,
  direction: ReadingDirection = "rtl",
  threshold = 48,
): "next" | "prev" | null {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  const movedRight = dx > 0;
  if (direction === "rtl") return movedRight ? "next" : "prev";
  return movedRight ? "prev" : "next";
}

/** 0..100. `index` may equal `pageCount`, which is the end screen. */
export function progressPercent(index: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.round((clamp(index + 1, 0, pageCount) / pageCount) * 100);
}

// ---------------------------------------------------------------------------
// Text and nikud
// ---------------------------------------------------------------------------

/**
 * The vocalized text of a page, or null when it cannot be used. It must
 * really contain nikud and have the same word count as the plain text,
 * otherwise word highlighting would point at the wrong word.
 */
export function usableNikud(page: Pick<Page, "text" | "textNikud">): string | null {
  const nikud = page.textNikud;
  if (!nikud || !hasNikud(nikud)) return null;
  if (splitWords(nikud).length !== splitWords(page.text).length) return null;
  return nikud;
}

export function bookHasNikud(book: { pages: Pick<Page, "text" | "textNikud">[] }): boolean {
  return book.pages.some((page) => usableNikud(page) !== null);
}

export function pageDisplayText(page: Pick<Page, "text" | "textNikud">, nikud: boolean): string {
  return (nikud ? usableNikud(page) : null) ?? page.text;
}

/**
 * The language a translated book was written in, when its source text was
 * kept: the reader can then switch between the translation and the original.
 * Null for a book that is not a translation or has no source text.
 */
export function switchableOriginalLanguage(
  book: Pick<BookWithPages, "language" | "originalLanguage"> & { pages: Pick<Page, "originalText">[] },
): BookLanguage | null {
  const original = book.originalLanguage;
  if (!original || original === bookLanguage(book)) return null;
  return book.pages.some((page) => (page.originalText ?? "").trim() !== "") ? original : null;
}

export interface TextLine {
  words: { text: string; index: number }[];
}

/**
 * Splits text into lines and words. Word indexes run across the whole page
 * and match splitWords(text), which is the tokenization of wordTimings.
 */
export function layoutWords(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let index = 0;
  for (const raw of text.split(/\r?\n/)) {
    const words = splitWords(raw).map((word) => ({ text: word, index: index++ }));
    if (words.length > 0) lines.push({ words });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Word timings
// ---------------------------------------------------------------------------

/** Timings are used only when there is exactly one per word and each names its word; anything else would highlight wrongly. */
export function usableTimings(
  page: Pick<Page, "text" | "wordTimings" | "audio"> & Pick<Partial<Page>, "textNikud">,
): WordTiming[] | null {
  if (!page.audio || !page.wordTimings || page.wordTimings.length === 0) return null;
  // The words are compared, not only counted: after an edit that keeps the word
  // count the audio says the old word, and highlighting the new one would mislead.
  // The narrated text may be the vocalized one, whose spelling can differ from the plain text.
  const matches =
    timingWordsMatch(page.wordTimings, page.text, { ignoreNikud: true }) ||
    (!!page.textNikud && timingWordsMatch(page.wordTimings, page.textNikud, { ignoreNikud: true }));
  if (!matches) return null;
  return page.wordTimings;
}

/**
 * Index of the word being spoken at `time` seconds: the last word that has
 * started. Stays on a word through the short gap before the next one, and is
 * -1 before the first word starts.
 */
export function activeWordIndex(timings: readonly WordTiming[], time: number): number {
  let low = 0;
  let high = timings.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timings[mid].start <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

export interface StoredProgress {
  pageIndex: number;
  completed: boolean;
  /** ISO date. */
  updatedAt: string;
}

export interface StartPage {
  index: number;
  /** True when the reader continues from a saved position after the first page. */
  resumed: boolean;
}

/**
 * Where to open the book. An explicit page (from the URL) always wins.
 * Otherwise the newest of the device and account positions is used, and a
 * finished book starts again from the first page.
 */
export function resolveStartPage(options: {
  pageCount: number;
  requested?: number | null;
  local?: StoredProgress | null;
  server?: StoredProgress | null;
}): StartPage {
  const last = Math.max(0, options.pageCount - 1);
  if (typeof options.requested === "number" && Number.isFinite(options.requested)) {
    return { index: clamp(Math.trunc(options.requested), 0, last), resumed: false };
  }
  const candidates = [options.local, options.server].filter((entry): entry is StoredProgress => !!entry);
  if (candidates.length === 0) return { index: 0, resumed: false };
  const stamp = (entry: StoredProgress) => Date.parse(entry.updatedAt) || 0;
  const newest = candidates.reduce((a, b) => (stamp(b) > stamp(a) ? b : a));
  if (newest.completed) return { index: 0, resumed: false };
  const index = clamp(Math.trunc(newest.pageIndex), 0, last);
  return { index, resumed: index > 0 };
}

/** "3:05" for the sleep timer. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
