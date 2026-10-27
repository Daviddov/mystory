// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListenPlayer } from "./ListenPlayer";
import type { ListenTrack } from "./tracks";

function makeTrack(id: string, overrides: Partial<ListenTrack> = {}): ListenTrack {
  return {
    id,
    slug: id,
    title: `סיפור ${id}`,
    author: "מחברת",
    ageGroup: "3-5",
    ageGroups: [overrides.ageGroup ?? "3-5"],
    readingMinutes: 3,
    coverUrl: "",
    coverType: "",
    pages: [
      { number: 1, audioUrl: `/media/books/${id}/p1.mp3` },
      { number: 2, audioUrl: `/media/books/${id}/p2.mp3` },
    ],
    hasMockAudio: false,
    ...overrides,
  };
}

const tracks = [makeTrack("a"), makeTrack("b", { ageGroup: "6-8", hasMockAudio: true })];

/** The age filter chips (the story buttons also mention an age). */
function ageChip(name: RegExp): HTMLElement {
  return within(screen.getByRole("region", { name: "למי מקריאים הערב?" })).getByRole("button", { name });
}

function audio(): HTMLAudioElement {
  const element = document.querySelector("audio");
  if (!element) throw new Error("no audio element");
  return element;
}

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom has no media playback: play and pause only fire the matching events.
  const playingElements = new WeakSet<HTMLMediaElement>();
  play = vi.fn(function (this: HTMLMediaElement) {
    playingElements.add(this);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  pause = vi.fn(function (this: HTMLMediaElement) {
    playingElements.delete(this);
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) {
    return !playingElements.has(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ListenPlayer", () => {
  it("starts the first story and continues page by page and story by story", () => {
    render(<ListenPlayer tracks={tracks} />);
    expect(screen.getByText("מוכנים לסיפור?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(audio().getAttribute("src")).toBe("/media/books/a/p1.mp3");
    expect(screen.getByText("חלק 1 מתוך 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "השהיה" })).toBeInTheDocument();

    fireEvent.ended(audio());
    expect(audio().getAttribute("src")).toBe("/media/books/a/p2.mp3");
    expect(screen.getByText("חלק 2 מתוך 2")).toBeInTheDocument();

    fireEvent.ended(audio());
    expect(audio().getAttribute("src")).toBe("/media/books/b/p1.mp3");
    expect(play).toHaveBeenCalledTimes(3);
  });

  it("pauses and resumes without restarting the page", () => {
    render(<ListenPlayer tracks={tracks} />);
    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    fireEvent.click(screen.getByRole("button", { name: "השהיה" }));
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    expect(play).toHaveBeenCalledTimes(2);
    expect(audio().getAttribute("src")).toBe("/media/books/a/p1.mp3");
  });

  it("plays a story chosen from the list and skips with the next button", () => {
    render(<ListenPlayer tracks={tracks} />);
    fireEvent.click(screen.getByRole("button", { name: /סיפור b/ }));
    expect(audio().getAttribute("src")).toBe("/media/books/b/p1.mp3");
    fireEvent.click(screen.getByRole("button", { name: "לסיפור הבא" }));
    expect(audio().getAttribute("src")).toBe("/media/books/a/p1.mp3");
  });

  it("filters the queue by age and stops playback when the filter changes", () => {
    render(<ListenPlayer tracks={tracks} />);
    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    fireEvent.click(ageChip(/גילאי 6 עד 8/));
    expect(pause).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /סיפור a/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /סיפור b/ })).toBeInTheDocument();

    fireEvent.click(ageChip(/גילאי 0 עד 2/));
    expect(screen.getByText("אין עדיין סיפורים מוקלטים לגיל הזה")).toBeInTheDocument();
  });

  it("says when the narration is a demo voice", () => {
    render(<ListenPlayer tracks={tracks} />);
    expect(screen.getByRole("note")).toHaveTextContent("קול הדגמה");
  });

  it("stops at the end of the story when the sleep timer says so", () => {
    render(<ListenPlayer tracks={tracks} />);
    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    fireEvent.click(screen.getByRole("button", { name: "עד סוף הסיפור" }));
    fireEvent.ended(audio());
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.ended(audio());
    // No third page was started.
    expect(play).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("לילה טוב");
  });

  it("stops when the timed sleep timer runs out", () => {
    vi.useFakeTimers();
    render(<ListenPlayer tracks={tracks} />);
    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    fireEvent.click(screen.getByRole("button", { name: "5 דקות" }));
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");

    act(() => {
      vi.advanceTimersByTime(4 * 60_000 + 50_000);
    });
    expect(pause).not.toHaveBeenCalled();
    // Ten seconds before the end the narration is already fading out.
    expect(audio().volume).toBeLessThan(1);

    act(() => {
      vi.advanceTimersByTime(11_000);
    });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(audio().volume).toBe(1);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("gives up with a message after repeated load failures", () => {
    render(<ListenPlayer tracks={tracks} />);
    fireEvent.click(screen.getByRole("button", { name: "הפעלה" }));
    fireEvent.error(audio());
    fireEvent.error(audio());
    fireEvent.error(audio());
    expect(screen.getByRole("status")).toHaveTextContent("לא הצלחנו להשמיע");
  });
});
