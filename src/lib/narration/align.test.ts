import { describe, expect, it } from "vitest";
import { splitWords, stripNikud } from "../hebrew";
import { AlignmentError, alignWords, foldForAlignment, timingsMatchText, type CharacterAlignment } from "./align";

/** One alignment entry per UTF-16 unit of `spoken`, each lasting `step` seconds. */
function perChar(spoken: string, step = 0.1): CharacterAlignment {
  const characters = Array.from(spoken);
  return {
    characters,
    startTimes: characters.map((_, i) => Number((i * step).toFixed(3))),
    endTimes: characters.map((_, i) => Number(((i + 1) * step).toFixed(3))),
  };
}

function expectMonotonic(timings: { start: number; end: number }[]) {
  timings.forEach((timing, i) => {
    expect(timing.end).toBeGreaterThanOrEqual(timing.start);
    if (i > 0) expect(timing.start).toBeGreaterThanOrEqual(timings[i - 1].end);
  });
}

describe("alignWords", () => {
  it("maps plain text one to one, with punctuation attached to its word", () => {
    const text = "שלום, עולם!";
    const { wordTimings, method } = alignWords(text, perChar(text));
    expect(method).toBe("exact");
    expect(wordTimings).toEqual([
      { word: "שלום,", start: 0, end: 0.5 },
      { word: "עולם!", start: 0.6, end: 1.1 },
    ]);
  });

  it("returns the displayed vocalized tokens exactly", () => {
    const text = "הַחִלָּזוֹן הָלַךְ לְאַט, לְאַט.";
    const { wordTimings, method } = alignWords(text, perChar(text));
    expect(method).toBe("exact");
    expect(wordTimings.map((t) => t.word)).toEqual(splitWords(text));
    expect(timingsMatchText(wordTimings, text)).toBe(true);
    expectMonotonic(wordTimings);
    // The first word spans all of its letters and marks: 11 code units.
    expect(wordTimings[0]).toEqual({ word: "הַחִלָּזוֹן", start: 0, end: 1.1 });
  });

  it("keeps a maqaf-joined pair as one token spanning both words", () => {
    const text = "בֵּית־סֵפֶר גָּדוֹל";
    const { wordTimings } = alignWords(text, perChar(text));
    expect(wordTimings).toHaveLength(2);
    expect(wordTimings[0].word).toBe("בֵּית־סֵפֶר");
    const firstTokenLength = Array.from("בֵּית־סֵפֶר").length;
    expect(wordTimings[0].start).toBe(0);
    expect(wordTimings[0].end).toBeCloseTo(firstTokenLength * 0.1, 3);
    expect(wordTimings[1].start).toBeCloseTo((firstTokenLength + 1) * 0.1, 3);
  });

  it("matches when the vendor spoke the text without nikud", () => {
    const text = "הַכּוֹכָב הַקָּטָן הוֹלֵךְ לִישֹׁן.";
    const { wordTimings, method } = alignWords(text, perChar(stripNikud(text)));
    expect(method).toBe("exact");
    expect(wordTimings.map((t) => t.word)).toEqual(splitWords(text));
    // "הכוכב" is 5 letters, then a space, then "הקטן".
    expect(wordTimings[0]).toMatchObject({ start: 0, end: 0.5 });
    expect(wordTimings[1]).toMatchObject({ start: 0.6, end: 1 });
  });

  it("matches across a maqaf / hyphen and quote variants", () => {
    const text = "בית־ספר ״גדול״ – כן";
    const { wordTimings, method } = alignWords(text, perChar('בית-ספר "גדול" - כן'));
    expect(method).toBe("exact");
    expect(wordTimings.map((t) => t.word)).toEqual(["בית־ספר", "״גדול״", "–", "כן"]);
    expectMonotonic(wordTimings);
  });

  it("times a stand-alone punctuation token", () => {
    const text = "כן - לא";
    const { wordTimings } = alignWords(text, perChar(text));
    expect(wordTimings).toEqual([
      { word: "כן", start: 0, end: 0.2 },
      { word: "-", start: 0.3, end: 0.4 },
      { word: "לא", start: 0.5, end: 0.7 },
    ]);
  });

  it("ignores line breaks, repeated spaces and bidi marks", () => {
    const text = "אחת\nשתיים   שלוש";
    const { wordTimings, method } = alignWords(text, perChar("‏אחת שתיים שלוש"));
    expect(method).toBe("exact");
    expect(wordTimings.map((t) => t.word)).toEqual(["אחת", "שתיים", "שלוש"]);
    expect(wordTimings[0].start).toBe(0.1);
  });

  it("accepts multi-character alignment entries", () => {
    const { wordTimings } = alignWords("אב גד", {
      characters: ["אב", " ", "גד"],
      startTimes: [0, 0.4, 0.5],
      endTimes: [0.4, 0.5, 1],
    });
    expect(wordTimings).toEqual([
      { word: "אב", start: 0, end: 0.4 },
      { word: "גד", start: 0.5, end: 1 },
    ]);
  });

  it("interpolates a word the vendor rewrote (a spelled-out number)", () => {
    const text = "יש לי 3 כדורים";
    const { wordTimings, method } = alignWords(text, perChar("יש לי שלושה כדורים"));
    expect(method).toBe("fuzzy");
    expect(wordTimings.map((t) => t.word)).toEqual(["יש", "לי", "3", "כדורים"]);
    expectMonotonic(wordTimings);
    // "3" sits between the end of "לי" and the start of "כדורים".
    expect(wordTimings[2].start).toBeGreaterThanOrEqual(wordTimings[1].end);
    expect(wordTimings[2].end).toBeLessThanOrEqual(wordTimings[3].start);
    expect(wordTimings[3].start).toBeCloseTo(1.2, 3);
  });

  it("gives trailing unmatched words the time left until the end of the audio", () => {
    const { wordTimings, method } = alignWords("אבא 7 8", perChar("אבא"), { durationSeconds: 1.3 });
    expect(method).toBe("fuzzy");
    expect(wordTimings).toEqual([
      { word: "אבא", start: 0, end: 0.3 },
      { word: "7", start: 0.3, end: 0.8 },
      { word: "8", start: 0.8, end: 1.3 },
    ]);
  });

  it("falls back to proportional timing when nothing matches", () => {
    const { wordTimings, method } = alignWords("אב גדהו", perChar("xyz"), { durationSeconds: 3 });
    expect(method).toBe("proportional");
    expect(wordTimings).toEqual([
      { word: "אב", start: 0, end: 1 },
      { word: "גדהו", start: 1, end: 3 },
    ]);
  });

  it("falls back to proportional timing when the alignment is empty", () => {
    const { wordTimings, method } = alignWords("אחת שתיים", { characters: [], startTimes: [], endTimes: [] });
    expect(method).toBe("proportional");
    expect(wordTimings).toHaveLength(2);
  });

  it("repairs overlapping and reversed vendor times", () => {
    const { wordTimings } = alignWords("אב גד", {
      characters: ["א", "ב", " ", "ג", "ד"],
      startTimes: [0, 0.2, 0.5, 0.4, 0.6],
      endTimes: [0.2, 0.7, 0.5, 0.6, 0.5],
    });
    expectMonotonic(wordTimings);
    expect(wordTimings.map((t) => t.word)).toEqual(["אב", "גד"]);
  });

  it("returns nothing for empty text", () => {
    expect(alignWords("  \n ", perChar("abc"))).toEqual({ wordTimings: [], method: "empty", coverage: 0 });
  });

  it("rejects malformed alignment data", () => {
    expect(() => alignWords("אב", { characters: ["א", "ב"], startTimes: [0], endTimes: [0.1, 0.2] })).toThrow(
      AlignmentError,
    );
    expect(() => alignWords("א", { characters: ["א"], startTimes: [Number.NaN], endTimes: [0.1] })).toThrow(
      AlignmentError,
    );
  });

  it("always returns one timing per word for a long vocalized page", () => {
    const text =
      "בַּגִּנָּה שֶׁלָּנוּ יֵשׁ עֵץ גָּדוֹל. מִי מִתְחַבֵּא מֵאֲחוֹרֵי הָעֵץ? זֶה חָתוּל קָטָן, אָפֹר־לָבָן! ״מְיָאוּ״, הוּא אוֹמֵר.";
    const { wordTimings, method } = alignWords(text, perChar(text, 0.05));
    expect(method).toBe("exact");
    expect(timingsMatchText(wordTimings, text)).toBe(true);
    expectMonotonic(wordTimings);
  });
});

describe("foldForAlignment", () => {
  it("drops nikud, whitespace and controls and unifies punctuation", () => {
    expect(foldForAlignment("שָׁלוֹם")).toBe("שלום");
    expect(foldForAlignment(" א‏ ב\n")).toBe("אב");
    expect(foldForAlignment("בית־ספר")).toBe("בית-ספר");
    expect(foldForAlignment("צ׳יפס ״כן״…")).toBe("צ'יפס\"כן\"...");
    // A presentation form decomposes to its base letter.
    expect(foldForAlignment("שׁ")).toBe("ש");
  });
});

describe("timingsMatchText", () => {
  it("requires one timing per word, naming that word", () => {
    const timings = [
      { word: "אחת", start: 0, end: 1 },
      { word: "שתיים", start: 1, end: 2 },
    ];
    expect(timingsMatchText(timings, "אחת שתיים")).toBe(true);
    expect(timingsMatchText(timings, "אחת שלוש")).toBe(false);
    expect(timingsMatchText(timings, "אחת שתיים שלוש")).toBe(false);
    expect(timingsMatchText(undefined, "אחת")).toBe(false);
  });
});
