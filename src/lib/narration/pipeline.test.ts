import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNikudProvider, mockTtsProvider, silentWav } from "../ai/mock";
import type { NikudProvider, TtsProvider } from "../ai/types";
import { splitWords } from "../hebrew";
import { NotFoundError } from "../repo/types";
import { createTempData, type TempData } from "../../test/temp-data";
import { isNarrationUpToDate, narrateBookWith, narratePageWith, narrationText, pageState, type NarrationDeps } from "./pipeline";

/** A pretend real TTS: distinct bytes per call so replaced files are detectable. */
function fakeRealTts(): TtsProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: "fake-real",
    isMock: false,
    calls,
    async synthesize(text) {
      calls.push(text);
      const words = splitWords(text);
      return {
        audio: new TextEncoder().encode(`mp3:${calls.length}:${text}`),
        contentType: "audio/mpeg",
        wordTimings: words.map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 })),
        durationSeconds: words.length * 0.5,
        isMock: false,
      };
    },
  };
}

const fakeNikud: NikudProvider = {
  name: "fake-nikud",
  isMock: false,
  async addNikud(text) {
    // Adds a patach after every Hebrew letter; keeps the word count.
    return { text: text.replace(/[א-ת]/g, (letter) => `${letter}ַ`), isMock: false };
  },
};

describe("narration pipeline", () => {
  let temp: TempData;
  let bookId: string;
  const deps = (overrides: Partial<NarrationDeps> = {}): NarrationDeps => ({
    repo: temp.repo,
    media: temp.media,
    nikud: mockNikudProvider,
    tts: mockTtsProvider,
    ...overrides,
  });

  beforeEach(async () => {
    temp = await createTempData();
    const book = await temp.repo.createBook({
      title: "ספר בדיקה",
      ownerId: "u_owner",
      pages: [
        { index: 0, text: "שלום עולם, מה שלומך?" },
        { index: 1, text: "גן ירוק", textNikud: "גַּן יָרֹק" },
        { index: 2, text: "   " },
      ],
    });
    bookId = book.id;
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it("stores mock audio labelled as mock, with one timing per word", async () => {
    const summary = await narrateBookWith(deps(), bookId);
    expect(summary).toMatchObject({ total: 3, narrated: 2, skipped: 1, failed: 0, ttsMock: true, nikudMock: true });
    expect(summary.results[2]).toMatchObject({ status: "skipped", reason: "empty" });

    const book = await temp.repo.getBookById(bookId);
    const [first, second, third] = book!.pages;
    expect(first.audioSource).toBe("mock");
    expect(first.audio).toMatch(new RegExp(`^books/${bookId}/narration-01-[0-9a-f]{10}\\.wav$`));
    expect(first.wordTimings?.map((t) => t.word)).toEqual(splitWords(first.text));
    expect(first.textNikud).toBeUndefined(); // the mock nikud must not be stored as nikud

    // The vocalized text is what is narrated when the page has one.
    expect(second.wordTimings?.map((t) => t.word)).toEqual(["גַּן", "יָרֹק"]);
    expect(second.textNikud).toBe("גַּן יָרֹק");
    expect(third.audio).toBeUndefined();

    const stored = await temp.media.get(first.audio!);
    expect(stored?.contentType).toBe("audio/wav");
    expect(stored?.size).toBeGreaterThan(44);
  });

  it("is idempotent per page and narrates again with force", async () => {
    await narrateBookWith(deps(), bookId);
    const before = await temp.repo.getBookById(bookId);

    const again = await narrateBookWith(deps(), bookId);
    expect(again).toMatchObject({ narrated: 0, skipped: 3, failed: 0 });
    expect(again.results[0].reason).toBe("up-to-date");
    expect((await temp.repo.getBookById(bookId))!.updatedAt).toBe(before!.updatedAt);

    const forced = await narrateBookWith(deps(), bookId, { force: true });
    expect(forced.narrated).toBe(2);
  });

  // The mock audio depends only on the word count, so the new text has a different one.
  it("narrates again only the page whose text changed, and removes its old file", async () => {
    await narrateBookWith(deps(), bookId);
    const before = await temp.repo.getBookById(bookId);
    const oldAudio = before!.pages[0].audio!;
    await temp.repo.replacePages(
      bookId,
      before!.pages.map((page) => (page.index === 0 ? { ...page, text: "טקסט חדש" } : page)),
    );

    const summary = await narrateBookWith(deps(), bookId);
    expect(summary.results.map((r) => r.status)).toEqual(["narrated", "skipped", "skipped"]);
    const after = await temp.repo.getBookById(bookId);
    expect(after!.pages[0].audio).not.toBe(oldAudio);
    expect(await temp.media.get(oldAudio)).toBeNull();
    expect(isNarrationUpToDate(after!.pages[0])).toBe(true);
  });

  it("narrates again when the audio file is missing", async () => {
    await narrateBookWith(deps(), bookId);
    const book = await temp.repo.getBookById(bookId);
    await temp.media.delete(book!.pages[0].audio!);
    const result = await narratePageWith(deps(), bookId, 0);
    expect(result.status).toBe("narrated");
  });

  it("replaces demo audio once a real TTS is configured, and never the other way round", async () => {
    await narrateBookWith(deps(), bookId);
    const tts = fakeRealTts();

    const upgraded = await narrateBookWith(deps({ tts }), bookId);
    expect(upgraded).toMatchObject({ narrated: 2, ttsMock: false });
    const book = await temp.repo.getBookById(bookId);
    expect(book!.pages[0].audioSource).toBe("tts");
    expect(book!.pages[0].audio).toMatch(/\.mp3$/);
    const mediaFiles = await temp.media.list(`books/${bookId}`);
    expect(mediaFiles.filter((file) => file.endsWith(".wav"))).toEqual([]);

    const downgraded = await narrateBookWith(deps(), bookId, { force: true });
    expect(downgraded.narrated).toBe(0);
    expect(downgraded.results[0].reason).toBe("kept-real-audio");
    expect((await temp.repo.getBookById(bookId))!.pages[0].audioSource).toBe("tts");
  });

  it("stores nikud from a real provider and speaks the vocalized text", async () => {
    const tts = fakeRealTts();
    const result = await narratePageWith(deps({ nikud: fakeNikud, tts }), bookId, 0);
    expect(result).toMatchObject({ status: "narrated", nikudAdded: true, audioSource: "tts" });

    const page = (await temp.repo.getBookById(bookId))!.pages[0];
    expect(page.textNikud).toBeDefined();
    expect(splitWords(page.textNikud!)).toHaveLength(splitWords(page.text).length);
    expect(tts.calls).toEqual([page.textNikud]);
    expect(page.wordTimings?.map((t) => t.word)).toEqual(splitWords(page.textNikud!));
    expect(narrationText(page)).toBe(page.textNikud);
  });

  it("keeps an existing vocalization instead of asking the provider", async () => {
    const addNikud = vi.fn(fakeNikud.addNikud);
    await narratePageWith(deps({ nikud: { ...fakeNikud, addNikud } }), bookId, 1);
    expect(addNikud).not.toHaveBeenCalled();
    expect((await temp.repo.getBookById(bookId))!.pages[1].textNikud).toBe("גַּן יָרֹק");
  });

  it("does not store nikud that changes the word count", async () => {
    const broken: NikudProvider = {
      name: "broken",
      isMock: false,
      addNikud: async (text) => ({ text: `${text} עוֹד`, isMock: false }),
    };
    const result = await narratePageWith(deps({ nikud: broken }), bookId, 0);
    expect(result.status).toBe("narrated");
    expect(result.nikudAdded).toBe(false);
    expect(result.warnings.join(" ")).toContain("word count");
    const page = (await temp.repo.getBookById(bookId))!.pages[0];
    expect(page.textNikud).toBeUndefined();
    expect(page.wordTimings).toHaveLength(splitWords(page.text).length);
  });

  it("never replaces a parent's recording unless asked", async () => {
    const book = await temp.repo.getBookById(bookId);
    await temp.media.put(`books/${bookId}/rec-1.webm`, new Uint8Array([1, 2, 3]), "audio/webm");
    await temp.repo.replacePages(
      bookId,
      book!.pages.map((page) =>
        page.index === 0 ? { ...page, audio: `books/${bookId}/rec-1.webm`, audioSource: "recorded" as const } : page,
      ),
    );

    const kept = await narratePageWith(deps(), bookId, 0, { force: true });
    expect(kept).toMatchObject({ status: "skipped", reason: "recorded" });

    const replaced = await narratePageWith(deps(), bookId, 0, { overwriteRecorded: true });
    expect(replaced.status).toBe("narrated");
    // The recording itself is not a narration file, so it is left in storage.
    expect(await temp.media.get(`books/${bookId}/rec-1.webm`)).not.toBeNull();
  });

  it("reports a failing page and continues with the next", async () => {
    const flaky: TtsProvider = {
      name: "flaky",
      isMock: false,
      async synthesize(text, options) {
        if (text.startsWith("שלום")) throw new Error("vendor down");
        return { ...(await mockTtsProvider.synthesize(text, options)), isMock: false };
      },
    };
    const seen: number[] = [];
    const summary = await narrateBookWith(deps({ tts: flaky }), bookId, { onPage: (r) => seen.push(r.pageIndex) });
    expect(summary).toMatchObject({ narrated: 1, failed: 1, skipped: 1 });
    expect(summary.results[0]).toMatchObject({ status: "failed", error: "vendor down" });
    expect(seen).toEqual([0, 1, 2]);
    expect((await temp.repo.getBookById(bookId))!.pages[0].audio).toBeUndefined();
  });

  it("fails a page when the provider returns the wrong number of timings", async () => {
    const bad: TtsProvider = {
      name: "bad",
      isMock: false,
      synthesize: async () => ({
        audio: silentWav(1),
        contentType: "audio/wav",
        wordTimings: [{ word: "x", start: 0, end: 1 }],
        durationSeconds: 1,
        isMock: false,
      }),
    };
    await expect(narratePageWith(deps({ tts: bad }), bookId, 0)).rejects.toThrow(/word timings/);
    expect(await temp.media.list(`books/${bookId}`)).toEqual([]);
  });

  it("stores nothing when the page text changes during narration", async () => {
    const slow: TtsProvider = {
      name: "slow",
      isMock: false,
      async synthesize(text, options) {
        const book = await temp.repo.getBookById(bookId);
        await temp.repo.replacePages(
          bookId,
          book!.pages.map((page) => (page.index === 0 ? { ...page, text: "נערך בינתיים" } : page)),
        );
        return { ...(await mockTtsProvider.synthesize(text, options)), isMock: false };
      },
    };
    const result = await narratePageWith(deps({ tts: slow }), bookId, 0);
    expect(result).toMatchObject({ status: "skipped", reason: "stale" });
    const page = (await temp.repo.getBookById(bookId))!.pages[0];
    expect(page.text).toBe("נערך בינתיים");
    expect(page.audio).toBeUndefined();
    expect(await temp.media.list(`books/${bookId}`)).toEqual([]);
  });

  it("narrates only the requested pages and stops when aborted", async () => {
    const only = await narrateBookWith(deps(), bookId, { pages: [1] });
    expect(only.results.map((r) => r.pageIndex)).toEqual([1]);

    const controller = new AbortController();
    const aborted = await narrateBookWith(deps(), bookId, {
      force: true,
      signal: controller.signal,
      onPage: () => controller.abort(),
    });
    expect(aborted.aborted).toBe(true);
    expect(aborted.results).toHaveLength(1);
  });

  it("throws NotFoundError for a missing book or page", async () => {
    await expect(narrateBookWith(deps(), "nope")).rejects.toBeInstanceOf(NotFoundError);
    await expect(narratePageWith(deps(), bookId, 99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("describes page state for the studio", async () => {
    await narrateBookWith(deps(), bookId);
    const book = await temp.repo.getBookById(bookId);
    expect(book!.pages.map(pageState)).toEqual([
      { pageIndex: 0, hasText: true, hasAudio: true, audioSource: "mock", upToDate: true, hasNikud: false },
      { pageIndex: 1, hasText: true, hasAudio: true, audioSource: "mock", upToDate: true, hasNikud: true },
      { pageIndex: 2, hasText: false, hasAudio: false, upToDate: false, hasNikud: false },
    ]);
  });
});
