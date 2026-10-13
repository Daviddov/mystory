import { describe, expect, it } from "vitest";
import type { BookWithPages, WordTiming } from "../types";
import {
  activeWordIndex,
  bookHasNikud,
  formatCountdown,
  keyToAction,
  layoutWords,
  pageDisplayText,
  progressPercent,
  resolveStartPage,
  swipeToAction,
  toPlayerBook,
  usableNikud,
  usableTimings,
} from "./logic";

describe("page turning in a right-to-left book", () => {
  it("goes forward with the left arrow and back with the right arrow", () => {
    expect(keyToAction("ArrowLeft")).toBe("next");
    expect(keyToAction("ArrowRight")).toBe("prev");
    expect(keyToAction("ArrowLeft", "ltr")).toBe("prev");
    expect(keyToAction("ArrowRight", "ltr")).toBe("next");
  });

  it("maps the other keys", () => {
    expect(keyToAction("PageDown")).toBe("next");
    expect(keyToAction("PageUp")).toBe("prev");
    expect(keyToAction("Home")).toBe("first");
    expect(keyToAction("End")).toBe("last");
    expect(keyToAction(" ")).toBe("toggle-audio");
    expect(keyToAction("f")).toBe("fullscreen");
    expect(keyToAction("a")).toBeNull();
  });

  it("turns forward when the page is dragged to the right", () => {
    expect(swipeToAction(120, 5)).toBe("next");
    expect(swipeToAction(-120, 5)).toBe("prev");
    expect(swipeToAction(120, 5, "ltr")).toBe("prev");
  });

  it("ignores short and mostly vertical gestures", () => {
    expect(swipeToAction(20, 0)).toBeNull();
    expect(swipeToAction(80, 100)).toBeNull();
    expect(swipeToAction(60, 50)).toBeNull();
  });

  it("reports progress including the end screen", () => {
    expect(progressPercent(0, 8)).toBe(13);
    expect(progressPercent(7, 8)).toBe(100);
    expect(progressPercent(8, 8)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe("nikud", () => {
  const vocalized = { text: "לילה טוב, ענן רך.", textNikud: "לַיְלָה טוֹב, עָנָן רַךְ." };

  it("uses vocalized text only when the toggle is on", () => {
    expect(pageDisplayText(vocalized, true)).toBe(vocalized.textNikud);
    expect(pageDisplayText(vocalized, false)).toBe(vocalized.text);
  });

  it("falls back to plain text when a page has no nikud", () => {
    expect(pageDisplayText({ text: "שלום" }, true)).toBe("שלום");
  });

  it("rejects nikud text without vowel points or with a different word count", () => {
    expect(usableNikud({ text: "שלום עולם", textNikud: "שלום עולם" })).toBeNull();
    expect(usableNikud({ text: "שלום עולם", textNikud: "שָׁלוֹם" })).toBeNull();
    expect(usableNikud(vocalized)).toBe(vocalized.textNikud);
  });

  it("knows whether a book has any nikud", () => {
    expect(bookHasNikud({ pages: [{ text: "שלום" }, vocalized] })).toBe(true);
    expect(bookHasNikud({ pages: [{ text: "שלום" }] })).toBe(false);
    expect(bookHasNikud({ pages: [] })).toBe(false);
  });
});

describe("words and timings", () => {
  const timings: WordTiming[] = [
    { word: "לילה", start: 0.2, end: 0.6 },
    { word: "טוב,", start: 0.7, end: 1.0 },
    { word: "ענן", start: 1.4, end: 1.8 },
  ];

  it("numbers words across lines in splitWords order", () => {
    const lines = layoutWords("אחת שתיים\n\nשלוש  ארבע");
    expect(lines).toHaveLength(2);
    expect(lines[0].words.map((w) => w.index)).toEqual([0, 1]);
    expect(lines[1].words).toEqual([
      { text: "שלוש", index: 2 },
      { text: "ארבע", index: 3 },
    ]);
  });

  it("finds the word being spoken", () => {
    expect(activeWordIndex(timings, 0)).toBe(-1);
    expect(activeWordIndex(timings, 0.2)).toBe(0);
    expect(activeWordIndex(timings, 0.65)).toBe(0); // gap: stay on the last started word
    expect(activeWordIndex(timings, 0.7)).toBe(1);
    expect(activeWordIndex(timings, 1.2)).toBe(1);
    expect(activeWordIndex(timings, 99)).toBe(2);
    expect(activeWordIndex([], 1)).toBe(-1);
  });

  it("uses timings only when there is one per word and the page has audio", () => {
    const page = { text: "לילה טוב, ענן", audio: "books/b/p1.wav", wordTimings: timings };
    expect(usableTimings(page)).toBe(timings);
    expect(usableTimings({ ...page, audio: undefined })).toBeNull();
    expect(usableTimings({ ...page, text: "לילה טוב" })).toBeNull();
    expect(usableTimings({ ...page, wordTimings: [] })).toBeNull();
    expect(usableTimings({ ...page, wordTimings: undefined })).toBeNull();
  });
});

describe("resume position", () => {
  const older = "2026-01-01T10:00:00.000Z";
  const newer = "2026-01-02T10:00:00.000Z";

  it("starts at the first page with nothing saved", () => {
    expect(resolveStartPage({ pageCount: 8 })).toEqual({ index: 0, resumed: false });
  });

  it("lets an explicit page win and clamps it", () => {
    const local = { pageIndex: 5, completed: false, updatedAt: newer };
    expect(resolveStartPage({ pageCount: 8, requested: 2, local })).toEqual({ index: 2, resumed: false });
    expect(resolveStartPage({ pageCount: 8, requested: 99 })).toEqual({ index: 7, resumed: false });
    expect(resolveStartPage({ pageCount: 8, requested: -4 })).toEqual({ index: 0, resumed: false });
  });

  it("uses the newest of the device and account positions", () => {
    const local = { pageIndex: 2, completed: false, updatedAt: older };
    const server = { pageIndex: 5, completed: false, updatedAt: newer };
    expect(resolveStartPage({ pageCount: 8, local, server })).toEqual({ index: 5, resumed: true });
    expect(
      resolveStartPage({ pageCount: 8, local: { ...local, updatedAt: newer }, server: { ...server, updatedAt: older } }),
    ).toEqual({ index: 2, resumed: true });
  });

  it("starts a finished book from the beginning", () => {
    const local = { pageIndex: 7, completed: true, updatedAt: newer };
    expect(resolveStartPage({ pageCount: 8, local })).toEqual({ index: 0, resumed: false });
  });

  it("clamps a saved page that no longer exists", () => {
    const local = { pageIndex: 20, completed: false, updatedAt: newer };
    expect(resolveStartPage({ pageCount: 3, local })).toEqual({ index: 2, resumed: true });
    expect(resolveStartPage({ pageCount: 0, local })).toEqual({ index: 0, resumed: false });
  });
});

describe("helpers", () => {
  it("formats the sleep countdown", () => {
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(64.2)).toBe("1:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });

  it("strips owner-only fields before a book goes to the browser", () => {
    const book = {
      id: "bk_1",
      shareToken: "secret",
      reviewNote: "note",
      costUsd: 1.5,
      title: "ספר",
      pages: [],
    } as unknown as BookWithPages;
    const stripped = toPlayerBook(book) as Record<string, unknown>;
    expect(stripped.shareToken).toBeUndefined();
    expect(stripped.reviewNote).toBeUndefined();
    expect(stripped.costUsd).toBeUndefined();
    expect(stripped.title).toBe("ספר");
  });
});
