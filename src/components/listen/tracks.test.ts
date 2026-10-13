import { describe, expect, it } from "vitest";
import type { BookWithPages } from "@/lib/types";
import {
  buildListenTracks,
  fadeVolume,
  filterTracks,
  formatRemaining,
  nextPage,
  nextStory,
  parseAgeFilter,
  previousStory,
} from "./tracks";

function makeBook(id: string, overrides: Partial<BookWithPages> = {}): BookWithPages {
  return {
    id,
    slug: id,
    title: `ספר ${id}`,
    summary: "",
    author: "מחברת",
    illustrator: "",
    license: "CC BY 4.0",
    source: "",
    ageGroup: "3-5",
    readingMinutes: 3,
    coverImage: `books/${id}/cover.svg`,
    status: "published",
    ownerId: "system",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: [],
    origin: "manual",
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    pages: [
      { index: 0, text: "אחת", audio: `books/${id}/p1.mp3`, audioSource: "tts" },
      { index: 1, text: "שתיים", audio: `books/${id}/p2.mp3`, audioSource: "tts" },
    ],
    ...overrides,
  };
}

describe("buildListenTracks", () => {
  it("keeps only published books that have narration, with only their narrated pages", () => {
    const tracks = buildListenTracks([
      makeBook("a"),
      makeBook("silent", { pages: [{ index: 0, text: "בלי קול" }] }),
      makeBook("draft", { status: "private" }),
      makeBook("partial", {
        ageGroup: "0-2",
        pages: [
          { index: 0, text: "בלי קול" },
          { index: 1, text: "עם קול", audio: "books/partial/p2.wav", audioSource: "mock" },
        ],
      }),
    ]);
    expect(tracks.map((track) => track.id)).toEqual(["a", "partial"]);
    expect(tracks[0].pages.map((page) => page.audioUrl)).toEqual([
      "/media/books/a/p1.mp3?v=2026-01-02T00%3A00%3A00.000Z",
      "/media/books/a/p2.mp3?v=2026-01-02T00%3A00%3A00.000Z",
    ]);
    expect(tracks[0].hasMockAudio).toBe(false);
    expect(tracks[0].coverType).toBe("image/svg+xml");
    expect(tracks[1].pages.map((page) => page.number)).toEqual([2]);
    expect(tracks[1].hasMockAudio).toBe(true);
  });

  it("handles a book without a cover", () => {
    const [track] = buildListenTracks([makeBook("a", { coverImage: "" })]);
    expect(track.coverUrl).toBe("");
    expect(track.coverType).toBe("");
  });
});

describe("queue navigation", () => {
  const queue = buildListenTracks([makeBook("a"), makeBook("b", { ageGroup: "6-8" })]);

  it("filters by age", () => {
    expect(filterTracks(queue, "all")).toHaveLength(2);
    expect(filterTracks(queue, "6-8").map((track) => track.id)).toEqual(["b"]);
    expect(filterTracks(queue, "0-2")).toEqual([]);
    expect(parseAgeFilter("3-5")).toBe("3-5");
    expect(parseAgeFilter("99")).toBe("all");
    expect(parseAgeFilter(undefined)).toBe("all");
  });

  it("moves page by page, then to the next story, then wraps around", () => {
    expect(nextPage(queue, { track: 0, page: 0 })).toEqual({ position: { track: 0, page: 1 }, storyEnded: false });
    expect(nextPage(queue, { track: 0, page: 1 })).toEqual({ position: { track: 1, page: 0 }, storyEnded: true });
    expect(nextPage(queue, { track: 1, page: 1 })).toEqual({ position: { track: 0, page: 0 }, storyEnded: true });
    expect(nextPage([], { track: 0, page: 0 })).toBeNull();
    expect(nextPage(queue, { track: 7, page: 0 })).toBeNull();
  });

  it("skips between stories", () => {
    expect(nextStory(queue, { track: 1, page: 1 })).toEqual({ track: 0, page: 0 });
    expect(nextStory([], { track: 0, page: 0 })).toBeNull();
    // In the middle of a story "previous" restarts it; at its start it goes one story back.
    expect(previousStory(queue, { track: 1, page: 1 })).toEqual({ track: 1, page: 0 });
    expect(previousStory(queue, { track: 1, page: 0 }, 10)).toEqual({ track: 1, page: 0 });
    expect(previousStory(queue, { track: 1, page: 0 }, 1)).toEqual({ track: 0, page: 0 });
    expect(previousStory(queue, { track: 0, page: 0 })).toEqual({ track: 1, page: 0 });
  });
});

describe("sleep timer helpers", () => {
  it("formats the time left", () => {
    expect(formatRemaining(725)).toBe("12:05");
    expect(formatRemaining(59.2)).toBe("1:00");
    expect(formatRemaining(-3)).toBe("0:00");
  });

  it("fades the volume over the last seconds", () => {
    expect(fadeVolume(120)).toBe(1);
    expect(fadeVolume(10)).toBe(0.5);
    expect(fadeVolume(0)).toBe(0);
    expect(fadeVolume(-5)).toBe(0);
  });
});
