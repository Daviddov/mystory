import { describe, expect, it } from "vitest";
import { buildCaptionCards, chapterTimestamp, wrapLine } from "./video-captions";

describe("video captions", () => {
  it("wraps by visible letters, ignoring nikud", () => {
    const rows = wrapLine("בַּגַּן שֶׁל תָּמָר בְּקֶצֶה הָרְחוֹב", 12);
    expect(rows.map((r) => r.text)).toEqual(["בַּגַּן שֶׁל תָּמָר", "בְּקֶצֶה הָרְחוֹב"]);
    expect(rows[1].firstWord).toBe(3);
  });

  it("keeps lines together and switches cards on the word timings", () => {
    const text = "אחת שתיים\nשלוש ארבע\nחמש שש";
    const timings = [0, 1, 2, 3, 4, 5].map((start) => ({ start }));
    const cards = buildCaptionCards({ text, duration: 7, timings, maxChars: 20, maxRows: 2 });
    expect(cards).toEqual([
      { rows: ["אחת שתיים", "שלוש ארבע"], start: 0, end: 4 },
      { rows: ["חמש שש"], start: 4, end: 7 },
    ]);
  });

  it("estimates the times from the letters when the timings do not match", () => {
    const cards = buildCaptionCards({ text: "אבג\nדהו", duration: 10, timings: [{ start: 0 }], maxChars: 20, maxRows: 1 });
    expect(cards.map((c) => [c.start, c.end])).toEqual([
      [0, 5],
      [5, 10],
    ]);
  });

  it("formats chapter timestamps", () => {
    expect(chapterTimestamp(0)).toBe("0:00");
    expect(chapterTimestamp(75.9)).toBe("1:15");
    expect(chapterTimestamp(3725)).toBe("1:02:05");
  });
});
