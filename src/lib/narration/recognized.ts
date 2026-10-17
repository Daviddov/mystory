/**
 * Word timings for a recording from what speech recognition heard in it.
 * Pure functions, safe on client and server.
 *
 * The recognizer's words rarely match the page exactly (a misheard letter,
 * a number spelled out, a word skipped or repeated), so they are spread into
 * a character alignment and matched to the page text with the fuzzy aligner.
 * A result that matched too little of the page is refused: a wrong timing is
 * worse than the in-browser estimate the reader falls back to.
 */
import { alignWords, type AlignmentResult, type CharacterAlignment } from "./align";
import type { WordTiming } from "../types";

export interface RecognizedWord {
  word: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
}

/** Least share of the page's words that must be timed by matched characters. */
export const MIN_COVERAGE = 0.6;

/**
 * One alignment entry per letter of the recognized words, each word's span
 * shared out over its letters (so a long word is not timed as one instant),
 * with a space between words.
 */
export function recognizedWordsToAlignment(words: readonly RecognizedWord[]): CharacterAlignment {
  const characters: string[] = [];
  const startTimes: number[] = [];
  const endTimes: number[] = [];
  for (const w of words) {
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
    const end = Math.max(w.start, w.end);
    const letters = [...w.word.trim()];
    if (letters.length === 0) continue;
    const step = (end - w.start) / letters.length;
    letters.forEach((ch, i) => {
      characters.push(ch);
      startTimes.push(w.start + i * step);
      endTimes.push(w.start + (i + 1) * step);
    });
    characters.push(" ");
    startTimes.push(end);
    endTimes.push(end);
  }
  return { characters, startTimes, endTimes };
}

export type RecognizedTimingsResult =
  | { ok: true; wordTimings: WordTiming[]; method: AlignmentResult["method"]; coverage: number }
  | { ok: false; reason: string; coverage: number };

/**
 * One timing per splitWords(text) token, from the recognized words, or the
 * reason they cannot be trusted.
 */
export function timingsFromRecognizedWords(
  text: string,
  words: readonly RecognizedWord[],
  options: { durationSeconds?: number; minCoverage?: number } = {},
): RecognizedTimingsResult {
  const minCoverage = options.minCoverage ?? MIN_COVERAGE;
  if (words.length === 0) return { ok: false, reason: "no words were recognized", coverage: 0 };
  const { wordTimings, method, coverage } = alignWords(text, recognizedWordsToAlignment(words), {
    durationSeconds: options.durationSeconds,
  });
  if (method === "empty") return { ok: false, reason: "the page has no text", coverage: 0 };
  if (method === "proportional") return { ok: false, reason: "the recognized words do not match the text", coverage };
  if (coverage < minCoverage) {
    return {
      ok: false,
      reason: `only ${Math.round(coverage * 100)}% of the words matched (need ${Math.round(minCoverage * 100)}%)`,
      coverage,
    };
  }
  return { ok: true, wordTimings, method, coverage };
}
