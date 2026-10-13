/** Hebrew text helpers. Pure functions, safe on client and server. */

/** Hebrew cantillation marks and vowel points (nikud), U+0591..U+05C7 except maqaf U+05BE. */
const NIKUD_RE = /[֑-ֽֿ-ׇ]/g;

export function stripNikud(text: string): string {
  return text.replace(NIKUD_RE, "");
}

export function hasNikud(text: string): boolean {
  return /[ְ-ׇּׁׂ]/.test(text);
}

/** Lowercase, strip nikud and punctuation, collapse whitespace. For free-text search. */
export function normalizeForSearch(text: string): string {
  return stripNikud(text)
    .toLowerCase()
    .replace(/[־\-_.,;:!?"'`׳״()[\]{}…–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into whitespace-separated tokens (words keep their attached
 * punctuation). This is THE tokenization used for wordTimings: timing i belongs
 * to splitWords(narratedText)[i].
 */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * True when `timings` has exactly one entry per word of `text` and each entry
 * names its word. Comparing the count alone misses an edit that keeps the
 * number of words ("דני" -> "רוני"), which leaves audio that says the old word.
 * With `ignoreNikud`, vowel points are not compared (the same letters match).
 */
export function timingWordsMatch(
  timings: readonly { word: string }[] | undefined,
  text: string | undefined,
  options: { ignoreNikud?: boolean } = {},
): boolean {
  if (!timings || text === undefined) return false;
  const words = splitWords(text);
  if (timings.length !== words.length) return false;
  const norm = (value: string) => (options.ignoreNikud ? stripNikud(value) : value);
  return timings.every((timing, i) => norm(timing.word) === norm(words[i]));
}

export function countWords(text: string): number {
  return splitWords(text).length;
}

/** Estimated read-aloud minutes for a set of page texts (about 90 Hebrew words per minute). */
export function estimateReadingMinutes(texts: string[]): number {
  const words = texts.reduce((sum, t) => sum + countWords(t), 0);
  return Math.max(1, Math.round(words / 90));
}

const TRANSLIT: Record<string, string> = {
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y",
  כ: "k", ך: "k", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", ע: "a", פ: "p",
  ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

/**
 * Build a URL-safe latin slug from any title (Hebrew is transliterated
 * roughly). Returns "" when nothing usable remains; callers should fall back
 * to an id in that case (LocalRepository.createBook does).
 */
export function slugify(input: string): string {
  const latin = Array.from(stripNikud(input).toLowerCase())
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("");
  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
