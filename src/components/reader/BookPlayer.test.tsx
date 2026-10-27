// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerBook } from "@/lib/reader/logic";
import { BookPlayer } from "./BookPlayer";

function makeBook(overrides: Partial<PlayerBook> = {}): PlayerBook {
  return {
    id: "bk_test",
    slug: "test-book",
    title: "ספר בדיקה",
    summary: "",
    author: "",
    illustrator: "",
    license: "",
    source: "",
    ageGroup: "3-5",
    readingMinutes: 1,
    coverImage: "",
    status: "published",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: ["מה אהבנו בסיפור?"],
    origin: "manual",
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { index: 0, text: "עמוד ראשון כאן" },
      { index: 1, text: "עמוד שני כאן" },
      { index: 2, text: "עמוד שלישי כאן" },
    ],
    ...overrides,
  };
}

const narratedPages: PlayerBook["pages"] = [
  {
    index: 0,
    text: "שלום לכם ילדים",
    audio: "books/bk_test/p1.wav",
    audioSource: "mock",
    wordTimings: [
      { word: "שלום", start: 0, end: 0.4 },
      { word: "לכם", start: 0.4, end: 0.8 },
      { word: "ילדים", start: 0.8, end: 1.2 },
    ],
  },
  { index: 1, text: "עמוד שני", audio: "books/bk_test/p2.wav", audioSource: "tts" },
];

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no media playback; emulate the events a browser would fire.
  play = vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  pause = vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new Event("pause"));
  });
  // jsdom does not implement modal dialogs either.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mainAudio(container: HTMLElement): HTMLAudioElement {
  return container.querySelector("audio:not([muted])") as HTMLAudioElement;
}

describe("BookPlayer", () => {
  it("shows the first page and turns pages with the big buttons", () => {
    render(<BookPlayer book={makeBook()} />);
    expect(screen.getByText("ראשון")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "לעמוד הקודם" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "לעמוד הבא" }));
    expect(screen.getByText("שני")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "לעמוד הקודם" }));
    expect(screen.getByText("ראשון")).toBeInTheDocument();
  });

  it("turns to the next page when the page itself is tapped, but not when a button is", () => {
    render(<BookPlayer book={makeBook()} />);
    const page = screen.getByText("ראשון");
    fireEvent.pointerDown(page, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(page, { pointerId: 1, clientX: 102, clientY: 101 });
    expect(screen.getByText("שני")).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "לעמוד הבא" });
    fireEvent.pointerDown(next, { pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(next, { pointerId: 2, clientX: 10, clientY: 10 });
    expect(screen.getByText("שני")).toBeInTheDocument();
  });

  it("goes forward with the left arrow and back with the right arrow", () => {
    render(<BookPlayer book={makeBook()} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("שני")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("שלישי")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("שני")).toBeInTheDocument();
  });

  it("turns forward when the page is swiped to the right", () => {
    render(<BookPlayer book={makeBook()} />);
    const stage = screen.getByRole("main");
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 260, clientY: 210 });
    expect(screen.getByText("שני")).toBeInTheDocument();
  });

  it("ends with discussion questions, read again and recommendations", () => {
    const other = { ...makeBook(), id: "bk_other", slug: "other-book", title: "ספר אחר" };
    render(<BookPlayer book={makeBook()} initialPage={2} recommendations={[other]} />);
    fireEvent.click(screen.getByRole("button", { name: "לסוף הסיפור" }));
    expect(screen.getByRole("heading", { name: "סוף הסיפור" })).toBeInTheDocument();
    expect(screen.getByText("מה אהבנו בסיפור?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ספר אחר/ })).toHaveAttribute("href", "/read/other-book");

    fireEvent.click(screen.getByRole("button", { name: "לקרוא שוב" }));
    expect(screen.getByText("ראשון")).toBeInTheDocument();
  });

  it("remembers the page on this device and resumes from it", () => {
    const first = render(<BookPlayer book={makeBook()} />);
    fireEvent.click(screen.getByRole("button", { name: "לעמוד הבא" }));
    first.unmount();

    render(<BookPlayer book={makeBook()} />);
    expect(screen.getByText("שני")).toBeInTheDocument();
    expect(screen.getByText(/ממשיכים מעמוד 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "להתחיל מההתחלה" }));
    expect(screen.getByText("ראשון")).toBeInTheDocument();
  });

  it("starts a finished book from the first page", () => {
    const first = render(<BookPlayer book={makeBook()} initialPage={2} />);
    fireEvent.click(screen.getByRole("button", { name: "לסוף הסיפור" }));
    first.unmount();
    render(<BookPlayer book={makeBook()} />);
    expect(screen.getByText("ראשון")).toBeInTheDocument();
  });

  it("does not touch device storage when embedded", () => {
    render(<BookPlayer book={makeBook()} variant="embedded" />);
    fireEvent.click(screen.getByRole("button", { name: "לעמוד הבא" }));
    expect(window.localStorage.length).toBe(0);
  });

  it("posts the position for a signed-in reader and survives a failing request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BookPlayer book={makeBook()} syncProgress />);
    fireEvent.click(screen.getByRole("button", { name: "לעמוד הבא" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/progress");
    expect(JSON.parse(init.body)).toMatchObject({ bookId: "bk_test", pageIndex: 1, completed: false });
    expect(screen.getByText("שני")).toBeInTheDocument();
  });

  it("switches between plain and vocalized text", () => {
    const book = makeBook({
      pages: [{ index: 0, text: "לילה טוב", textNikud: "לַיְלָה טוֹב" }],
    });
    render(<BookPlayer book={book} />);
    fireEvent.click(screen.getByRole("button", { name: "הגדרות קריאה" }));
    const toggle = screen.getByRole("checkbox", { name: "להציג ניקוד" });
    expect(toggle).toBeChecked();
    expect(screen.getByText("לַיְלָה")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("לילה")).toBeInTheDocument();
  });

  it("disables the nikud switch in the settings when the book has none", () => {
    render(<BookPlayer book={makeBook()} />);
    fireEvent.click(screen.getByRole("button", { name: "הגדרות קריאה" }));
    expect(screen.getByRole("checkbox", { name: "להציג ניקוד" })).toBeDisabled();
    expect(screen.getByText("לספר הזה אין גרסה מנוקדת.")).toBeInTheDocument();
  });

  it("shows the text by default, and keeps a reader's explicit choice to hide it", () => {
    const pages: PlayerBook["pages"] = [{ index: 0, text: "עמוד עם תמונה", image: "books/bk_test/page-1.png" }];
    const { container, unmount } = render(<BookPlayer book={makeBook({ pages })} />);
    expect(screen.getByRole("button", { name: "הצגת הטקסט" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.load(container.querySelector("main img")!);
    expect(screen.getByText("תמונה")).toBeInTheDocument();
    unmount();

    window.localStorage.setItem("mystory:reader-prefs", JSON.stringify({ textLayout: "hidden" }));
    const hidden = render(<BookPlayer book={makeBook({ pages })} />);
    fireEvent.load(hidden.container.querySelector("main img")!);
    expect(screen.queryByText("תמונה")).toBeNull();
  });

  it("does not hold the text back when the picture's shape never arrives", () => {
    vi.useFakeTimers();
    const pages: PlayerBook["pages"] = [{ index: 0, text: "עמוד עם תמונה איטית", image: "books/bk_test/slow.png" }];
    render(<BookPlayer book={makeBook({ pages })} />);
    expect(screen.queryByText("איטית")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText("איטית")).toBeInTheDocument();
  });

  it("keeps the page turners and the play button out of the story area", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    const stage = container.querySelector("main")!;
    expect(stage.querySelector("button")).toBeNull();
    const controls = container.querySelector("footer")!;
    expect(controls).toContainElement(screen.getByRole("button", { name: "לעמוד הבא" }));
    expect(controls).toContainElement(screen.getByRole("button", { name: "לעמוד הקודם" }));
    expect(controls).toContainElement(screen.getByRole("button", { name: "להשמיע את הסיפור" }));
  });

  it("hides and shows the text with the header button", () => {
    render(<BookPlayer book={makeBook()} />);
    const toggle = screen.getByRole("button", { name: "הצגת הטקסט" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("switches a translated book between Hebrew and its original language", () => {
    const book = makeBook({
      language: "he",
      originalLanguage: "en",
      credits: { originalTitle: "Test Book" },
      pages: [
        { index: 0, text: "לילה טוב", textNikud: "לַיְלָה טוֹב", originalText: "Good night" },
        { index: 1, text: "עמוד חדש" },
      ],
    });
    render(<BookPlayer book={book} />);
    expect(screen.getByText("לַיְלָה")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "להציג את הסיפור באנגלית" }));
    expect(screen.getByText("Good").closest("[lang]")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("heading", { name: "Test Book" })).toBeInTheDocument();

    // A page without source text stays in Hebrew.
    fireEvent.click(screen.getByRole("button", { name: "לעמוד הבא" }));
    expect(screen.getByText("חדש").closest("[lang]")).toHaveAttribute("lang", "he");

    fireEvent.click(screen.getByRole("button", { name: "לעמוד הקודם" }));
    fireEvent.click(screen.getByRole("button", { name: "להציג את הסיפור בעברית" }));
    expect(screen.getByText("לַיְלָה")).toBeInTheDocument();
  });

  it("offers no language switch for a book that is not a translation", () => {
    render(<BookPlayer book={makeBook()} />);
    expect(screen.queryByRole("button", { name: /להציג את הסיפור ב/ })).not.toBeInTheDocument();
  });

  it("has no play button and says so when the book has no narration", () => {
    render(<BookPlayer book={makeBook()} />);
    expect(screen.queryByRole("button", { name: "להשמיע את הסיפור" })).not.toBeInTheDocument();
    expect(screen.getByText(/לספר הזה אין הקראה/)).toBeInTheDocument();
  });

  it("plays and pauses narration and labels mock audio", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    expect(screen.getByRole("note")).toHaveTextContent("קול הדגמה");

    fireEvent.click(screen.getByRole("button", { name: "להשמיע את הסיפור" }));
    expect(play).toHaveBeenCalled();
    expect(mainAudio(container).getAttribute("src")).toContain("/media/books/bk_test/p1.wav");

    fireEvent.click(screen.getByRole("button", { name: "להשהות את ההקראה" }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "להשמיע את הסיפור" })).toBeInTheDocument();
  });

  it("advances to the next page when the narration of a page ends", async () => {
    vi.useFakeTimers();
    const { container } = render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    fireEvent.click(screen.getByRole("button", { name: "להשמיע את הסיפור" }));
    fireEvent.ended(mainAudio(container));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByText("שני")).toBeInTheDocument();
    expect(mainAudio(container).getAttribute("src")).toContain("p2.wav");
    expect(screen.queryByRole("note")).not.toBeInTheDocument(); // page 2 is real TTS, no mock notice
  });

  it("plays a tapped word from its timestamp and highlights it", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    fireEvent.click(screen.getByText("ילדים"));
    expect(mainAudio(container).currentTime).toBeCloseTo(0.8);
    expect(play).toHaveBeenCalled();
    expect(screen.getByText("ילדים")).toHaveClass("word-highlight");
    expect(screen.getByText("שלום")).not.toHaveClass("word-highlight");
  });

  it("stops narration and darkens the screen when the sleep timer ends", async () => {
    vi.useFakeTimers();
    render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    fireEvent.click(screen.getByRole("button", { name: "להשמיע את הסיפור" }));
    fireEvent.click(screen.getByRole("button", { name: "הגדרות קריאה" }));
    fireEvent.click(screen.getByRole("button", { name: "5 דקות", hidden: true }));
    pause.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    });
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText("לילה טוב")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "להמשיך לקרוא" }));
    expect(screen.getByRole("button", { name: "להשמיע את הסיפור" })).toBeInTheDocument();
  });

  it("toggles the bedtime theme", () => {
    render(<BookPlayer book={makeBook()} />);
    fireEvent.click(screen.getByRole("button", { name: "מצב לפני השינה" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("bedtime");
    fireEvent.click(screen.getByRole("button", { name: "מצב לפני השינה" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("day");
  });

  it("explains an empty book", () => {
    render(<BookPlayer book={makeBook({ pages: [] })} />);
    expect(screen.getByText("בספר הזה אין עדיין עמודים")).toBeInTheDocument();
  });
});

describe("BookPlayer: starting, navigating and voices", () => {
  it("opened from a card, asks how to start and reads on a tap", () => {
    render(<BookPlayer book={makeBook({ pages: narratedPages })} startScreen downloadControl={<button>הורדה</button>} />);
    expect(screen.getByRole("dialog", { name: "ספר בדיקה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הורדה" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /האזנה לסיפור/ }));
    expect(screen.queryByRole("dialog", { name: "ספר בדיקה" })).not.toBeInTheDocument();
    expect(play).toHaveBeenCalled();
  });

  it("jumps to a page from the progress bar", () => {
    // jsdom has no PointerEvent; a MouseEvent carries the coordinates.
    if (typeof window.PointerEvent === "undefined") {
      vi.stubGlobal(
        "PointerEvent",
        class extends MouseEvent {
          pointerId: number;
          pointerType: string;
          constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 0;
            this.pointerType = init.pointerType ?? "mouse";
          }
        },
      );
    }
    render(<BookPlayer book={makeBook()} />);
    const slider = screen.getByRole("slider", { name: "מעבר בין עמודי הספר" });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    // 300px wide, right to left: the left end is the last page.
    slider.getBoundingClientRect = () => ({ left: 0, right: 300, width: 300, top: 0, bottom: 10, height: 10 }) as DOMRect;
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 20 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 20 });
    expect(screen.getByText("שלישי")).toBeInTheDocument();
  });

  it("sets the narration speed with the turtle and the rabbit in the settings, and remembers it", () => {
    const { unmount } = render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    // The control bar stays uncluttered: the speed lives in the settings only.
    expect(screen.queryByRole("radiogroup", { name: "מהירות ההקראה" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "הגדרות קריאה" }));
    const fast = screen.getByRole("radio", { name: "מהר" });
    fireEvent.click(fast);
    expect(fast).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "רגיל" })).toHaveAttribute("aria-checked", "false");
    expect(JSON.parse(window.localStorage.getItem("mystory:reader-prefs") ?? "{}")).toMatchObject({ rate: 1.1 });

    unmount();
    render(<BookPlayer book={makeBook({ pages: narratedPages })} />);
    fireEvent.click(screen.getByRole("button", { name: "הגדרות קריאה" }));
    expect(screen.getByRole("radio", { name: "מהר" })).toHaveAttribute("aria-checked", "true");
  });

  it("plays a family recording picked as the voice", () => {
    const { container } = render(
      <BookPlayer
        book={makeBook({ pages: narratedPages })}
        recordings={[
          {
            id: "rec_1",
            bookId: "bk_test",
            title: "הקול של סבתא",
            status: "approved",
            mine: false,
            pages: [{ index: 0, audio: "books/bk_test/rec/rec_1/p1-a.webm" }],
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ]}
      />,
    );
    const picker = screen.getByRole("combobox", { name: "מי מקריא" });
    fireEvent.change(picker, { target: { value: "rec_1" } });
    expect(mainAudio(container).getAttribute("src")).toContain("/media/books/bk_test/rec/rec_1/p1-a.webm");
    fireEvent.change(picker, { target: { value: "original" } });
    expect(mainAudio(container).getAttribute("src")).toContain("/media/books/bk_test/p1.wav");
  });

  it("asks a signed-out reader to sign in before recording", () => {
    render(<BookPlayer book={makeBook()} recorder={{ signedIn: false, loginHref: "/login?next=x", canShare: true }} />);
    expect(screen.getByRole("link", { name: /הקלטה בקול שלי/ })).toHaveAttribute("href", "/login?next=x");
  });
});

describe("BookPlayer: living pictures", () => {
  const animatedPages: PlayerBook["pages"] = [
    {
      index: 0,
      text: "עמוד ראשון כאן",
      image: "books/bk_test/page-1.png",
      imageAlt: "ארנב קופץ בשדה",
      video: "books/bk_test/page-1.mp4",
      videoSource: "ai",
    },
    { index: 1, text: "עמוד שני כאן", image: "books/bk_test/page-2.png", video: "books/bk_test/page-2.mp4", videoSource: "mock" },
    { index: 2, text: "עמוד שלישי כאן", image: "books/bk_test/page-3.png" },
  ];

  function stubReducedMotion(reduce: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  function stageVideo(container: HTMLElement): HTMLVideoElement | null {
    return container.querySelector("main video");
  }

  it("plays the clip of an animated page muted and looped, with the picture as poster", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    const video = stageVideo(container)!;
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toContain("/media/books/bk_test/page-1.mp4");
    expect(video.getAttribute("poster")).toContain("/media/books/bk_test/page-1.png");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    // Same meaning as the picture it replaces.
    expect(screen.getByRole("img", { name: "ארנב קופץ בשדה" })).toBe(video);
    expect(container.querySelector("main img")).toBeNull();
    expect(play).toHaveBeenCalled();
    // A real clip is not labelled as a demo.
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("warms up the next page's clip lightly", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    const next = container.querySelector('video[preload="metadata"]');
    expect(next?.getAttribute("src")).toContain("/media/books/bk_test/page-2.mp4");
  });

  it("labels a demo clip", () => {
    render(<BookPlayer book={makeBook({ pages: animatedPages })} initialPage={1} />);
    expect(screen.getByRole("note")).toHaveTextContent("הנפשה לדוגמה");
  });

  it("shows a still picture that drifts slowly on a page without a clip", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} initialPage={2} />);
    expect(stageVideo(container)).toBeNull();
    const image = container.querySelector("main img")!;
    expect(image.getAttribute("src")).toContain("/media/books/bk_test/page-3.png");
    expect(image).toHaveClass("mystory-kenburns");
    // Each page moves in its own direction.
    expect((image as HTMLElement).style.getPropertyValue("--kb-name")).toBe("mystory-kb-2");
  });

  it("falls back to the picture when the clip fails", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    fireEvent.error(stageVideo(container)!);
    expect(stageVideo(container)).toBeNull();
    expect(screen.getByRole("img", { name: "ארנב קופץ בשדה" }).tagName).toBe("IMG");
  });

  it("keeps the pictures still when the device asks for less motion", () => {
    stubReducedMotion(true);
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    expect(stageVideo(container)).toBeNull();
    const image = screen.getByRole("img", { name: "ארנב קופץ בשדה" });
    expect(image.tagName).toBe("IMG");
    expect(image).not.toHaveClass("mystory-kenburns");
    expect(container.querySelector('video[preload="metadata"]')).toBeNull();
  });

  it("plays the clip when the device does not ask for less motion", () => {
    stubReducedMotion(false);
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    expect(stageVideo(container)).not.toBeNull();
  });

  it("turns living pictures off from the settings and remembers it", () => {
    const { container, unmount } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    expect(stageVideo(container)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "הגדרות קריאה" }));
    const toggle = screen.getByRole("checkbox", { name: "תמונות חיות" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(stageVideo(container)).toBeNull();
    const image = container.querySelector("main img")!;
    expect(image.getAttribute("src")).toContain("/media/books/bk_test/page-1.png");
    expect(image).not.toHaveClass("mystory-kenburns");
    expect(JSON.parse(window.localStorage.getItem("mystory:reader-prefs") ?? "{}")).toMatchObject({ liveImages: false });

    unmount();
    const again = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    expect(stageVideo(again.container)).toBeNull();
  });

  it("pauses the clip while the tab is hidden and resumes when it is back", () => {
    const { container } = render(<BookPlayer book={makeBook({ pages: animatedPages })} />);
    const video = stageVideo(container)!;
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pause.mock.contexts).toContain(video);

    play.mockClear();
    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(play.mock.contexts).toContain(video);
  });
});
