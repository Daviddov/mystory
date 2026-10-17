/**
 * Estimated word timings for a recording that came without any: a family
 * recording, or a narration uploaded in the studio. Pure functions, safe on
 * client and server.
 *
 *   const speech = detectSpeech(samples, sampleRate);        // where the voice is
 *   const timings = estimateWordTimings(text, speech, duration);
 *
 * The estimate is not speech recognition. It finds the pauses in the recording
 * and splits the words between the stretches of speech so that the pace stays
 * even and the stops fall where a reader stops (sentence ends, then commas and
 * line ends); inside a stretch the words share the time by their length.
 * On a LibriVox story checked against speech-recognition timings, 77% of the
 * words started within 0.3 s and 96% within 0.6 s.
 */
import { splitWords, stripNikud } from "../hebrew";
import type { WordTiming } from "../types";

export interface Span {
  start: number;
  end: number;
}

/** Analysis frame of the speech detector, in seconds. */
const FRAME = 0.02;
/** A quieter stretch shorter than this is a breath inside speech, not a pause. */
const MIN_PAUSE = 0.15;
/** A louder stretch shorter than this is a click, not speech. */
const MIN_SPEECH = 0.06;
/** Weight of an uneven pace (squared log of actual / expected length of a group). */
const PACE = 0.5;
/** Cost of ending a group after a word with no stop, a comma or line end, a sentence end. */
const STOP_COST = [1, 0.3, 0];
/** Cost of a long pause inside a group (shorter pauses cost less). */
const INNER_PAUSE = 1.5;
/** A pause this long (seconds) counts in full in the costs above. */
const LONG_PAUSE = 0.6;
/** At most this many speech stretches are joined into one group. */
const MAX_GROUP_SPANS = 8;

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

/**
 * The stretches of the recording where someone speaks. The threshold adapts to
 * the recording: it sits between the background noise and the voice, so a
 * phone recording in a noisy room works as well as a studio file. Returns []
 * when nothing stands out from the noise (silence, or a recording of noise).
 */
export function detectSpeech(samples: Float32Array, sampleRate: number): Span[] {
  const frameSize = Math.max(1, Math.round(FRAME * sampleRate));
  const levels: number[] = [];
  for (let at = 0; at < samples.length; at += frameSize) {
    const end = Math.min(samples.length, at + frameSize);
    let sum = 0;
    for (let i = at; i < end; i++) sum += samples[i] * samples[i];
    levels.push(10 * Math.log10(sum / (end - at) + 1e-10));
  }
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = percentile(sorted, 0.1);
  const loud = percentile(sorted, 0.95);
  if (loud - floor < 10) return [];
  const threshold = floor + Math.max(6, (loud - floor) * 0.3);

  // Voiced frames to spans, then close short gaps and drop short blips.
  const raw: Span[] = [];
  levels.forEach((level, i) => {
    if (level < threshold) return;
    const start = i * FRAME;
    const last = raw[raw.length - 1];
    if (last && start - last.end < 1e-6) last.end = start + FRAME;
    else raw.push({ start, end: start + FRAME });
  });
  const merged: Span[] = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last && span.start - last.end < MIN_PAUSE) last.end = span.end;
    else merged.push({ ...span });
  }
  const duration = samples.length / sampleRate;
  return merged
    .filter((span) => span.end - span.start >= MIN_SPEECH)
    .map((span) => ({ start: round(span.start), end: round(Math.min(duration, span.end)) }));
}

/** How strongly a reader stops after word i: 2 sentence end, 1 comma or line end, 0 none. */
function breakStrengths(text: string, words: readonly string[]): number[] {
  // The whitespace after each word, to see line ends.
  const gaps: string[] = [];
  const re = /\S+(\s*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) gaps.push(match[1]);
  return words.map((word, i) => {
    const bare = word.replace(/["'״׳”“’‘)»]+$/u, "");
    if (/[.!?…:]$/u.test(bare)) return 2;
    if (/[,;–—-]$/u.test(bare) || (gaps[i] ?? "").includes("\n")) return 1;
    return 0;
  });
}

/**
 * Places the words of `text` on the speech of a recording. `speech` comes from
 * detectSpeech; when it is empty the words are spread over the whole duration.
 * Returns one timing per splitWords(text) token, in order.
 */
export function estimateWordTimings(text: string, speech: readonly Span[], duration: number): WordTiming[] {
  const words = splitWords(text);
  if (words.length === 0 || !(duration > 0)) return [];
  const spans = speech.length > 0 ? speech.map((s) => ({ ...s })) : [{ start: 0, end: duration }];

  // Spoken length of a word: its letters, without nikud and punctuation.
  const weights = words.map((word) => Math.max(1, stripNikud(word).replace(/[^\p{L}\p{N}]/gu, "").length));
  const cum = [0];
  for (const weight of weights) cum.push(cum[cum.length - 1] + weight);
  const strengths = breakStrengths(text, words);


  const cuts = matchPauses(spans, cum, strengths);

  // Each stretch of words between two matched pauses fills the speech between them,
  // skipping any unmatched pause inside it (the reader stopped mid-sentence).
  const timings: WordTiming[] = [];
  const bounds = [{ word: 0, firstSpan: 0 }, ...cuts.map((c) => ({ word: c.word, firstSpan: c.pause + 1 }))];
  bounds.forEach((bound, k) => {
    const lastWord = k + 1 < bounds.length ? bounds[k + 1].word : words.length;
    const lastSpan = k + 1 < bounds.length ? bounds[k + 1].firstSpan - 1 : spans.length - 1;
    const chunk = spans.slice(bound.firstSpan, lastSpan + 1);
    const chunkSpoken = chunk.reduce((sum, s) => sum + (s.end - s.start), 0);
    const chunkWeight = cum[lastWord] - cum[bound.word];
    // Speech time -> clock time inside this stretch.
    const clock = (into: number): number => {
      let left = into;
      for (const s of chunk) {
        const length = s.end - s.start;
        if (left <= length + 1e-9) return s.start + left;
        left -= length;
      }
      return chunk[chunk.length - 1].end;
    };
    for (let word = bound.word; word < lastWord; word++) {
      const start = clock((chunkSpoken * (cum[word] - cum[bound.word])) / chunkWeight);
      const end = clock((chunkSpoken * (cum[word + 1] - cum[bound.word])) / chunkWeight);
      timings.push({ word: words[word], start: round(start), end: round(end) });
    }
  });
  return timings;
}

/**
 * Which pauses end a group of words, and after which word. Dynamic programming over
 * (speech stretches used, words used): the words are split into groups, each group
 * spoken over one or more consecutive stretches, so that
 *   - every group is spoken at about the reader's average pace (cum letters vs seconds),
 *   - a group ends where a reader stops (sentence end free, comma or line end cheap),
 *   - a long pause is not swallowed inside a group.
 * Returns cuts in order: words before `word` are spoken before the gap after span `pause`.
 */
function matchPauses(
  spans: readonly Span[],
  cum: readonly number[],
  strengths: readonly number[],
): { word: number; pause: number }[] {
  const m = spans.length;
  const n = cum.length - 1;
  if (m < 2) return [];
  const spoken = spans.map((s) => s.end - s.start);
  const spokenCum = [0];
  for (const length of spoken) spokenCum.push(spokenCum[spokenCum.length - 1] + length);
  const secondsPerUnit = spokenCum[m] / cum[n];
  const gap = (after: number) => spans[after + 1].start - spans[after].end;

  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const from: [number, number][][] = Array.from({ length: m + 1 }, () => new Array<[number, number]>(n + 1));
  cost[0][0] = 0;
  for (let j0 = 0; j0 < m; j0++) {
    for (let w0 = 0; w0 < n; w0++) {
      const base = cost[j0][w0];
      if (base === Infinity) continue;
      let inner = 0;
      for (let j = j0 + 1; j <= Math.min(m, j0 + MAX_GROUP_SPANS); j++) {
        if (j > j0 + 1) inner += INNER_PAUSE * Math.min(1, gap(j - 2) / LONG_PAUSE);
        const actual = spokenCum[j] - spokenCum[j0];
        // The last stretch must take the last word; any other group leaves words for the rest.
        const wFirst = j === m ? n : w0 + 1;
        const wLast = j === m ? n : n - (m - j) > w0 ? n - 1 : w0;
        for (let w = wFirst; w <= wLast; w++) {
          const expected = (cum[w] - cum[w0]) * secondsPerUnit;
          const pace = PACE * Math.log(actual / expected) ** 2;
          const stop = j < m ? STOP_COST[strengths[w - 1]] * Math.min(1, gap(j - 1) / LONG_PAUSE + 0.5) : 0;
          const total = base + inner + pace + stop;
          if (total < cost[j][w]) {
            cost[j][w] = total;
            from[j][w] = [j0, w0];
          }
        }
      }
    }
  }
  const cuts: { word: number; pause: number }[] = [];
  let at: [number, number] = [m, n];
  while (at[0] > 0) {
    const previous = from[at[0]][at[1]];
    if (!previous) return [];
    if (previous[0] > 0) cuts.unshift({ word: previous[1], pause: previous[0] - 1 });
    at = previous;
  }
  return cuts;
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
