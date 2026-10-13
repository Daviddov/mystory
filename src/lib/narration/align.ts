/**
 * Turns the character-level timestamps a TTS vendor returns into one timing
 * per displayed word. Pure functions, safe on client and server.
 *
 * The displayed tokens are splitWords(text): whitespace separated, with
 * punctuation attached, and a maqaf-joined pair ("בֵּית־סֵפֶר") counted as ONE
 * token. timings[i] always belongs to splitWords(text)[i] and carries that
 * exact token in `word`, whatever the vendor did to the text.
 *
 * Matching ignores everything that vendors commonly change: whitespace,
 * nikud and cantillation marks, bidi controls, and the Hebrew / typographic
 * variants of hyphen and quotes. Three strategies, tried in order:
 *
 *   exact         the vendor's characters match the text one to one
 *   fuzzy         they differ (e.g. a digit was spelled out); common characters
 *                 are matched with an LCS and the rest is interpolated
 *   proportional  nothing usable matched; the duration is shared out by
 *                 token length (approximate)
 */
import { splitWords } from "../hebrew";
import type { WordTiming } from "../types";

export interface CharacterAlignment {
  /** Usually one character per entry; longer entries share their timing. */
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

export type AlignmentMethod = "exact" | "fuzzy" | "proportional" | "empty";

export interface AlignmentResult {
  wordTimings: WordTiming[];
  method: AlignmentMethod;
}

export class AlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlignmentError";
  }
}

/** Largest LCS table (alignment units x text units) before falling back to proportional timing. */
const MAX_LCS_CELLS = 6_000_000;

const INVISIBLE_RE = /[\s​-‏‪-‮⁦-⁩﻿­]/u;
const MARK_RE = /\p{M}/u;

const PUNCTUATION_FOLD: Record<string, string> = {
  "־": "-", // maqaf
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "−": "-",
  "׳": "'", // geresh
  "‘": "'",
  "’": "'",
  "‚": "'",
  "״": '"', // gershayim
  "“": '"',
  "”": '"',
  "„": '"',
  "…": "...",
};

/**
 * The comparable form of a piece of text: no whitespace, no nikud or other
 * combining marks, no bidi controls, unified hyphens and quotes. May be "".
 */
export function foldForAlignment(value: string): string {
  let out = "";
  for (const ch of value.normalize("NFKD")) {
    if (INVISIBLE_RE.test(ch) || MARK_RE.test(ch)) continue;
    out += PUNCTUATION_FOLD[ch] ?? ch;
  }
  return out.toLowerCase();
}

function round(seconds: number): number {
  return Number(Math.max(0, seconds).toFixed(3));
}

interface Span {
  start: number;
  end: number;
}

/**
 * One timing per splitWords(text) token.
 * `durationSeconds` (the audio length) only matters for words the vendor gave
 * no timing for at the very end, and for the proportional fallback.
 */
export function alignWords(
  text: string,
  alignment: CharacterAlignment,
  options: { durationSeconds?: number } = {},
): AlignmentResult {
  const { characters, startTimes, endTimes } = alignment;
  if (characters.length !== startTimes.length || characters.length !== endTimes.length) {
    throw new AlignmentError(
      `alignment arrays differ in length (${characters.length} characters, ${startTimes.length} start times, ${endTimes.length} end times)`,
    );
  }
  for (let i = 0; i < characters.length; i++) {
    if (!Number.isFinite(startTimes[i]) || !Number.isFinite(endTimes[i])) {
      throw new AlignmentError(`alignment time ${i} is not a finite number`);
    }
  }

  const words = splitWords(text);
  if (words.length === 0) return { wordTimings: [], method: "empty" };

  // Units on the audio side: one per folded character, with its time span.
  const audioChars: string[] = [];
  const audioSpans: Span[] = [];
  let lastEnd = 0;
  for (let i = 0; i < characters.length; i++) {
    const span = { start: startTimes[i], end: Math.max(startTimes[i], endTimes[i]) };
    lastEnd = Math.max(lastEnd, span.end);
    for (const ch of foldForAlignment(characters[i])) {
      audioChars.push(ch);
      audioSpans.push(span);
    }
  }
  const duration = Math.max(lastEnd, options.durationSeconds ?? 0);

  // Units on the text side: one per folded character, with its token index.
  const textChars: string[] = [];
  const textToken: number[] = [];
  const foldedLength: number[] = [];
  words.forEach((word, tokenIndex) => {
    let length = 0;
    for (const ch of foldForAlignment(word)) {
      textChars.push(ch);
      textToken.push(tokenIndex);
      length++;
    }
    foldedLength.push(length);
  });

  const spans: (Span | null)[] = words.map(() => null);
  const touch = (tokenIndex: number, span: Span) => {
    const current = spans[tokenIndex];
    if (!current) spans[tokenIndex] = { start: span.start, end: span.end };
    else {
      current.start = Math.min(current.start, span.start);
      current.end = Math.max(current.end, span.end);
    }
  };

  let method: AlignmentMethod;
  if (audioChars.length === textChars.length && audioChars.every((ch, i) => ch === textChars[i])) {
    method = "exact";
    for (let i = 0; i < textChars.length; i++) touch(textToken[i], audioSpans[i]);
  } else if (
    audioChars.length > 0 &&
    textChars.length > 0 &&
    audioChars.length * textChars.length <= MAX_LCS_CELLS
  ) {
    method = "fuzzy";
    for (const [audioIndex, textIndex] of lcsPairs(audioChars, textChars)) {
      touch(textToken[textIndex], audioSpans[audioIndex]);
    }
    if (spans.every((span) => span === null)) method = "proportional";
  } else {
    method = "proportional";
  }

  if (method === "proportional") {
    return { wordTimings: proportionalTimings(words, foldedLength, duration), method };
  }

  fillMissing(spans, foldedLength, duration);

  // Keep the sequence monotonic and free of overlaps.
  const wordTimings: WordTiming[] = [];
  let previousStart = 0;
  for (let i = 0; i < words.length; i++) {
    const span = spans[i] as Span;
    const start = Math.max(span.start, previousStart);
    wordTimings.push({ word: words[i], start, end: Math.max(span.end, start) });
    previousStart = start;
  }
  for (let i = 0; i < wordTimings.length; i++) {
    const next = wordTimings[i + 1];
    if (next && wordTimings[i].end > next.start) wordTimings[i].end = next.start;
    wordTimings[i].start = round(wordTimings[i].start);
    wordTimings[i].end = round(wordTimings[i].end);
  }
  return { wordTimings, method };
}

/** Index pairs [a, b] of a longest common subsequence, in order. */
function lcsPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * Gives every token without a span a share of the gap between its timed
 * neighbours (from 0 at the beginning, up to `duration` at the end).
 */
function fillMissing(spans: (Span | null)[], foldedLength: readonly number[], duration: number): void {
  let i = 0;
  while (i < spans.length) {
    if (spans[i] !== null) {
      i++;
      continue;
    }
    let runEnd = i;
    while (runEnd < spans.length && spans[runEnd] === null) runEnd++;
    const from = i === 0 ? 0 : (spans[i - 1] as Span).end;
    const to = Math.max(from, runEnd === spans.length ? duration : (spans[runEnd] as Span).start);
    const weights = foldedLength.slice(i, runEnd).map((length) => Math.max(1, length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = from;
    for (let k = i; k < runEnd; k++) {
      const share = ((to - from) * weights[k - i]) / total;
      spans[k] = { start: cursor, end: cursor + share };
      cursor += share;
    }
    i = runEnd;
  }
}

function proportionalTimings(words: readonly string[], foldedLength: readonly number[], duration: number): WordTiming[] {
  const weights = foldedLength.map((length) => Math.max(1, length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return words.map((word, i) => {
    const start = cursor;
    cursor += (duration * weights[i]) / total;
    return { word, start: round(start), end: round(cursor) };
  });
}

/** True when there is exactly one timing per word of `text` and every timing names its word. */
export function timingsMatchText(timings: readonly WordTiming[] | undefined, text: string): boolean {
  if (!timings) return false;
  const words = splitWords(text);
  return timings.length === words.length && timings.every((timing, i) => timing.word === words[i]);
}
