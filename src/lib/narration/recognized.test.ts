import { describe, expect, it } from "vitest";
import { splitWords, stripNikud } from "../hebrew";
import { usableTimings } from "../reader/logic";
import { recognizedWordsToAlignment, timingsFromRecognizedWords, type RecognizedWord } from "./recognized";

/** Recognized words for `spoken`, each lasting 0.4 s with a 0.1 s pause, starting at `from`. */
function heard(spoken: string, from = 0.5): RecognizedWord[] {
  return splitWords(spoken).map((word, i) => ({
    word,
    start: Number((from + i * 0.5).toFixed(3)),
    end: Number((from + i * 0.5 + 0.4).toFixed(3)),
  }));
}

describe("recognizedWordsToAlignment", () => {
  it("spreads each word over its letters and adds a space between words", () => {
    const alignment = recognizedWordsToAlignment([
      { word: "שלום", start: 1, end: 1.4 },
      { word: "לך", start: 1.6, end: 2 },
    ]);
    expect(alignment.characters).toEqual(["ש", "ל", "ו", "ם", " ", "ל", "ך", " "]);
    expect(alignment.startTimes[0]).toBe(1);
    expect(alignment.startTimes[1]).toBeCloseTo(1.1);
    expect(alignment.endTimes[3]).toBeCloseTo(1.4);
    expect(alignment.startTimes[5]).toBe(1.6);
  });

  it("skips empty and broken words", () => {
    const alignment = recognizedWordsToAlignment([
      { word: "  ", start: 0, end: 1 },
      { word: "כן", start: Number.NaN, end: 1 },
      { word: "לא", start: 2, end: 1.5 },
    ]);
    expect(alignment.characters).toEqual(["ל", "א", " "]);
    // An end before the start is clamped to the start.
    expect(alignment.endTimes).toEqual([2, 2, 2]);
  });
});

describe("timingsFromRecognizedWords", () => {
  const text = "הַחִלָּזוֹן הָלַךְ לְאַט, לְאַט מְאוֹד.";

  it("times the vocalized page from words recognized without nikud", () => {
    const result = timingsFromRecognizedWords(text, heard(stripNikud(text).replace(/[.,]/g, "")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coverage).toBe(1);
    expect(result.wordTimings.map((t) => t.word)).toEqual(splitWords(text));
    expect(result.wordTimings[0]).toEqual({ word: "הַחִלָּזוֹן", start: 0.5, end: 0.9 });
    expect(result.wordTimings[2].start).toBe(1.5);
    expect(usableTimings({ text, audio: "rec.webm", wordTimings: result.wordTimings })).toBe(result.wordTimings);
  });

  it("tolerates a misheard and a skipped word", () => {
    // "הלך" heard as "הולך", "מאוד" not heard at all.
    const result = timingsFromRecognizedWords(text, heard("החלזון הולך לאט לאט"), { durationSeconds: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("fuzzy");
    expect(result.wordTimings).toHaveLength(5);
    expect(result.wordTimings[1].start).toBe(1);
    // The unheard last word gets the rest of the recording.
    expect(result.wordTimings[4].start).toBeGreaterThanOrEqual(result.wordTimings[3].end);
    expect(result.wordTimings[4].end).toBe(3);
  });

  it("refuses words that have nothing to do with the page", () => {
    const result = timingsFromRecognizedWords(text, heard("thank you for watching"));
    expect(result.ok).toBe(false);
  });

  it("refuses a recording that matches only a small part of the page", () => {
    const long = "הַיֶּלֶד הָלַךְ לַגַּן עִם אִמָּא שֶׁלּוֹ וְרָאָה פְּרָחִים יָפִים מְאוֹד בַּשְּׁבִיל";
    const result = timingsFromRecognizedWords(long, heard("הילד הלך"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.coverage).toBeLessThan(0.6);
    expect(result.reason).toMatch(/matched/);
  });

  it("refuses an empty transcript", () => {
    expect(timingsFromRecognizedWords(text, []).ok).toBe(false);
  });
});
