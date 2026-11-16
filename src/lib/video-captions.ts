/**
 * On-screen text for the exported story videos (scripts/export-media.ts).
 *
 * A page's text is split into "cards": a few rows that are shown together
 * while the narrator reads them. Cards follow the page's own line breaks
 * (rhymed books keep their couplets together) and switch at the moment the
 * narrator reaches the first word of the next card, taken from the page's
 * word timings when they match the text, or estimated from the letters
 * otherwise.
 *
 * Client-safe, no Node imports.
 */
import { splitWords, stripNikud } from "./hebrew";

export interface CaptionCard {
  rows: string[];
  /** Seconds from the start of the page audio. */
  start: number;
  end: number;
}

interface Row {
  text: string;
  /** Index (in the whole page) of the row's first word. */
  firstWord: number;
}

/** Visible length of a word: letters without vowel points. */
function visibleLength(word: string): number {
  return stripNikud(word).length;
}

/** Breaks one line into rows of at most `maxChars` visible characters (a longer single word gets its own row). */
export function wrapLine(line: string, maxChars: number, firstWord = 0): Row[] {
  const words = splitWords(line);
  const rows: Row[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let start = firstWord;
  words.forEach((word, i) => {
    const length = visibleLength(word);
    if (current.length > 0 && currentLength + 1 + length > maxChars) {
      rows.push({ text: current.join(" "), firstWord: start });
      current = [];
      currentLength = 0;
      start = firstWord + i;
    }
    current.push(word);
    currentLength += (current.length > 1 ? 1 : 0) + length;
  });
  if (current.length > 0) rows.push({ text: current.join(" "), firstWord: start });
  return rows;
}

export interface CaptionInput {
  /** The text to show (usually the vocalized text), with its line breaks. */
  text: string;
  /** Length of the page narration in seconds. */
  duration: number;
  /** Word timings of the narration; used only when there is one per word of `text`. */
  timings?: readonly { start: number }[];
  maxChars: number;
  maxRows: number;
}

export function buildCaptionCards({ text, duration, timings, maxChars, maxRows }: CaptionInput): CaptionCard[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  // Rows of each line, with global word indices.
  const lineRows: Row[][] = [];
  let wordIndex = 0;
  for (const line of lines) {
    lineRows.push(wrapLine(line, maxChars, wordIndex));
    wordIndex += splitWords(line).length;
  }
  const allWords = lines.flatMap((line) => splitWords(line));

  // When each word starts: from the timings, or by the share of letters read so far.
  const useTimings = !!timings && timings.length === allWords.length;
  const totalLetters = allWords.reduce((sum, w) => sum + visibleLength(w), 0) || 1;
  const startOf: number[] = [];
  let lettersBefore = 0;
  allWords.forEach((word, i) => {
    startOf.push(useTimings ? timings![i].start : (lettersBefore / totalLetters) * duration);
    lettersBefore += visibleLength(word);
  });

  // Group whole lines into cards; a line longer than a card is split by rows.
  const groups: Row[][] = [];
  let current: Row[] = [];
  for (const rows of lineRows) {
    if (current.length > 0 && current.length + rows.length > maxRows) {
      groups.push(current);
      current = [];
    }
    for (const row of rows) {
      if (current.length >= maxRows) {
        groups.push(current);
        current = [];
      }
      current.push(row);
    }
  }
  if (current.length > 0) groups.push(current);

  return groups.map((rows, i) => {
    const start = i === 0 ? 0 : Math.min(startOf[rows[0].firstWord] ?? 0, duration);
    const next = groups[i + 1];
    const end = next ? Math.min(startOf[next[0].firstWord] ?? duration, duration) : duration;
    return { rows: rows.map((r) => r.text), start, end: Math.max(end, start) };
  });
}

/** "m:ss" (or "h:mm:ss") for YouTube chapter lists. */
export function chapterTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
