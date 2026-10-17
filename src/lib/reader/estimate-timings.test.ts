import { describe, expect, it } from "vitest";
import { splitWords } from "../hebrew";
import { detectSpeech, estimateWordTimings } from "./estimate-timings";
import { usableTimings } from "./logic";

const RATE = 8000;

/** Silence and tone stretches, in seconds, as one recording. A little noise keeps the floor realistic. */
function recording(parts: { tone: boolean; seconds: number }[]): Float32Array {
  const total = parts.reduce((sum, p) => sum + Math.round(p.seconds * RATE), 0);
  const samples = new Float32Array(total);
  let at = 0;
  let seed = 7;
  for (const part of parts) {
    const n = Math.round(part.seconds * RATE);
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807) % 2147483647;
      const noise = ((seed / 2147483647) * 2 - 1) * 0.002;
      samples[at + i] = noise + (part.tone ? 0.4 * Math.sin((2 * Math.PI * 220 * i) / RATE) : 0);
    }
    at += n;
  }
  return samples;
}

describe("detectSpeech", () => {
  it("finds the spoken stretches and the pauses between them", () => {
    const samples = recording([
      { tone: false, seconds: 0.5 },
      { tone: true, seconds: 1 },
      { tone: false, seconds: 0.6 },
      { tone: true, seconds: 1.2 },
      { tone: false, seconds: 0.4 },
    ]);
    const spans = detectSpeech(samples, RATE);
    expect(spans).toHaveLength(2);
    expect(spans[0].start).toBeCloseTo(0.5, 1);
    expect(spans[0].end).toBeCloseTo(1.5, 1);
    expect(spans[1].start).toBeCloseTo(2.1, 1);
    expect(spans[1].end).toBeCloseTo(3.3, 1);
  });

  it("treats a short breath as part of the speech", () => {
    const samples = recording([
      { tone: false, seconds: 0.4 },
      { tone: true, seconds: 1 },
      { tone: false, seconds: 0.08 },
      { tone: true, seconds: 1 },
      { tone: false, seconds: 0.4 },
    ]);
    expect(detectSpeech(samples, RATE)).toHaveLength(1);
  });

  it("returns nothing for a silent recording", () => {
    expect(detectSpeech(recording([{ tone: false, seconds: 2 }]), RATE)).toEqual([]);
    expect(detectSpeech(new Float32Array(0), RATE)).toEqual([]);
  });
});

describe("estimateWordTimings", () => {
  it("gives one timing per word, in order, that the reader accepts", () => {
    const text = "הָיֹה הָיָה תַּיִשׁ קָטָן. הוּא רָצָה לַעֲבֹר בַּגֶּשֶׁר!";
    const timings = estimateWordTimings(text, [{ start: 0.3, end: 4 }], 4.5);
    expect(timings.map((t) => t.word)).toEqual(splitWords(text));
    for (let i = 1; i < timings.length; i++) expect(timings[i].start).toBeGreaterThanOrEqual(timings[i - 1].end - 1e-9);
    expect(usableTimings({ text, wordTimings: timings, audio: "a.mp3" })).toBe(timings);
  });

  it("starts at the voice, not at the leading silence", () => {
    const timings = estimateWordTimings("אחת שתיים שלוש", [{ start: 1.2, end: 3 }], 3.5);
    expect(timings[0].start).toBe(1.2);
    expect(timings[2].end).toBe(3);
  });

  it("puts the pause at the end of the sentence", () => {
    // The first sentence is short, but the reader paused after it: the second sentence starts after the pause.
    const text = "אחת שתיים. שלוש ארבע חמש שש שבע שמונה.";
    const timings = estimateWordTimings(text, [{ start: 0, end: 1 }, { start: 1.6, end: 4 }], 4);
    expect(timings[2].word).toBe("שלוש");
    expect(timings[2].start).toBe(1.6);
    expect(timings[1].end).toBe(1);
  });

  it("prefers a comma or a line end over the middle of a phrase", () => {
    const text = "אמר התייש הקטן,\nאני הולך לגבעה";
    // Halfway by letters would fall inside the first line; the pause belongs to the line end.
    const timings = estimateWordTimings(text, [{ start: 0, end: 1.2 }, { start: 1.6, end: 3 }], 3);
    expect(timings[3].word).toBe("אני");
    expect(timings[3].start).toBe(1.6);
  });

  it("skips a pause that fits nowhere and spreads the words over the speech around it", () => {
    const text = "אחת שתיים שלוש ארבע";
    const timings = estimateWordTimings(text, [{ start: 0, end: 0.2 }, { start: 3, end: 3.2 }, { start: 3.4, end: 6 }], 6);
    expect(timings).toHaveLength(4);
    expect(timings[3].end).toBe(6);
  });

  it("spreads the words over the whole recording when no speech was found", () => {
    const timings = estimateWordTimings("אחת שתיים", [], 2);
    expect(timings[0].start).toBe(0);
    expect(timings[1].end).toBe(2);
  });

  it("returns nothing for an empty page or an empty recording", () => {
    expect(estimateWordTimings("   ", [{ start: 0, end: 1 }], 1)).toEqual([]);
    expect(estimateWordTimings("שלום", [], 0)).toEqual([]);
  });
});
