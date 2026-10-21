/**
 * Translation logic and the POST /api/studio/books/[id]/translate route.
 * The text provider is always a stub: no test calls a real model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TextProvider, TextRequest } from "@/lib/ai/types";
import { mockTextProvider } from "@/lib/ai/mock";
import { missingPublishCredits, publishBlockers } from "@/app/admin/_lib/service";
import { MACHINE_TRANSLATOR_CREDIT } from "@/lib/credits";
import { publishProblems } from "@/lib/studio/shared";
import type { BookWithPages, User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";
import {
  acceptManualTranslation,
  translateBook,
  translationSource,
  translationSystemPrompt,
  TranslationError,
  type TranslationOutput,
} from "./index";

let currentUser: User | null = null;
let routeProvider: TextProvider = mockTextProvider;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!currentUser) throw new actual.AuthError(401);
      return currentUser;
    },
  };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, getTextProvider: async () => routeProvider };
});

import { POST as translateRoute } from "@/app/api/studio/books/[id]/translate/route";

const ENGLISH = [
  { text: "One day, Mr Sloth came to visit.\nI’m sleepy!", alt: "Mr Sloth is sleepy and yawning." },
  { text: "This branch looks lovely! I think I’ll sleep here.", alt: "Mr Sloth spots a branch." },
  { text: "", alt: "A picture without words." },
  { text: "And that branch was just the right one for his bed.", alt: "Mr Sloth smiles." },
];
const HEBREW = ["יום אחד בא מר עצלן לביקור.\nאני עייף!", "הענף הזה נראה נהדר! אני אישן כאן.", "והענף הזה היה בדיוק המיטה בשבילו."];

function goodOutput(): TranslationOutput {
  return {
    title: "מר עצלן הישנוני",
    summary: "מר עצלן מחפש ענף טוב לישון עליו.",
    pages: HEBREW.map((text, i) => ({ page: i + 1, text })),
  };
}

/** A provider that answers with the given outputs in turn and records the requests. */
function fakeProvider(outputs: (TranslationOutput | Error)[]): TextProvider & { requests: TextRequest<unknown>[] } {
  const requests: TextRequest<unknown>[] = [];
  return {
    name: "fake",
    isMock: false,
    requests,
    async generate<T>(request: TextRequest<T>) {
      requests.push(request as TextRequest<unknown>);
      const next = outputs[Math.min(requests.length - 1, outputs.length - 1)];
      if (next instanceof Error) throw next;
      return { data: request.schema.parse(next), isMock: false, usage: { costUsd: 0.01 } };
    },
  };
}

describe("book translation", () => {
  let data: TempData;
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    data = await createTempData({ setEnv: true });
    currentUser = null;
    routeProvider = mockTextProvider;
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await data.cleanup();
  });

  async function englishBook(overrides: Partial<BookWithPages> = {}): Promise<BookWithPages> {
    return data.repo.createBook({
      title: "Sleepy Mr Sloth",
      summary: "He knows how to swing.",
      ownerId: "u_owner",
      origin: "import",
      license: "CC BY 4.0",
      source: "https://example.org/sloth",
      language: "en",
      originalLanguage: "en",
      categories: ["animals"],
      credits: { publisher: "Book Dash", creators: "A, B, C", publisherLogo: "books/x/publisher-logo.png" },
      pages: ENGLISH.map((page, index) => ({
        index,
        text: page.text,
        ...(page.text ? { originalText: page.text } : {}),
        imageAlt: page.alt,
        image: `books/x/page-${index + 1}.jpg`,
        ...(index === 0 ? { audio: "books/x/old.mp3", audioSource: "tts" as const, textNikud: "x y z" } : {}),
      })),
      ...overrides,
    });
  }

  it("sends the whole book in one call and stores Hebrew next to the original", async () => {
    const book = await englishBook();
    const provider = fakeProvider([goodOutput()]);
    const result = await translateBook({ repo: data.repo, text: provider }, book.id, { translator: "  דנה   כהן " });

    expect(result.status).toBe("translated");
    expect(provider.requests).toHaveLength(1);
    const request = provider.requests[0];
    // One request carries every page that has text, with its illustration description.
    for (const page of ENGLISH.filter((p) => p.text)) {
      expect(request.prompt).toContain(JSON.stringify(page.text).slice(1, -1));
      expect(request.prompt).toContain(page.alt);
    }
    expect(request.prompt).toContain('"pageCount": 3');
    expect(request.prompt).not.toContain("A picture without words.");
    expect(request.system).toBe(translationSystemPrompt("en"));
    expect(request.system).toMatch(/rhyme/i);
    expect(request.system).toMatch(/exactly one Hebrew text for each page/);

    const stored = await data.repo.getBookById(book.id);
    expect(stored).toMatchObject({
      title: "מר עצלן הישנוני",
      summary: "מר עצלן מחפש ענף טוב לישון עליו.",
      language: "he",
      originalLanguage: "en",
      status: "draft",
      credits: {
        publisher: "Book Dash",
        creators: "A, B, C",
        publisherLogo: "books/x/publisher-logo.png",
        originalTitle: "Sleepy Mr Sloth",
        translator: "דנה כהן",
        adaptation: "Translation into Hebrew by דנה כהן",
      },
    });
    expect(stored?.pages.map((page) => page.text)).toEqual([HEBREW[0], HEBREW[1], "", HEBREW[2]]);
    expect(stored?.pages.map((page) => page.originalText)).toEqual([ENGLISH[0].text, ENGLISH[1].text, undefined, ENGLISH[3].text]);
    expect(stored?.pages.map((page) => page.imageAlt)).toEqual(ENGLISH.map((page) => page.alt));
    expect(stored?.pages.every((page) => page.image)).toBe(true);
    // Narration and nikud of the English text are gone.
    expect(stored?.pages[0]).not.toHaveProperty("audio");
    expect(stored?.pages[0]).not.toHaveProperty("textNikud");
    expect(result.status === "translated" && result.book).toEqual(stored);
  });

  it("credits a machine translation honestly when no translator is named", async () => {
    const book = await englishBook();
    await translateBook({ repo: data.repo, text: fakeProvider([goodOutput()]) }, book.id);
    const stored = await data.repo.getBookById(book.id);
    expect(stored?.credits?.translator).toBe(MACHINE_TRANSLATOR_CREDIT);
      expect(stored?.credits?.adaptation).toBe(`Translation into Hebrew by ${MACHINE_TRANSLATOR_CREDIT}`);
  });

  it("retries once when the page count is wrong, telling the model what was wrong", async () => {
    const book = await englishBook();
    const short = { ...goodOutput(), pages: goodOutput().pages.slice(0, 2) };
    const provider = fakeProvider([short, goodOutput()]);
    const result = await translateBook({ repo: data.repo, text: provider }, book.id);
    expect(result).toMatchObject({ status: "translated", attempts: 2 });
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1].prompt).toContain("You returned 2 page texts, but the book has exactly 3 pages.");
    expect((await data.repo.getBookById(book.id))?.language).toBe("he");
  });

  it.each([
    ["too many pages", { ...goodOutput(), pages: [...goodOutput().pages, { page: 4, text: "עוד עמוד" }] }],
    ["a page left in English", { ...goodOutput(), pages: goodOutput().pages.map((p, i) => (i === 1 ? { ...p, text: "Still English" } : p)) }],
    ["an empty page", { ...goodOutput(), pages: goodOutput().pages.map((p, i) => (i === 2 ? { ...p, text: " " } : p)) }],
    ["pages out of order", { ...goodOutput(), pages: [...goodOutput().pages].reverse() }],
    ["an English title", { ...goodOutput(), title: "Sleepy Mr Sloth" }],
  ])("stores nothing after two unusable answers (%s)", async (_name, bad) => {
    const book = await englishBook();
    const provider = fakeProvider([bad]);
    await expect(translateBook({ repo: data.repo, text: provider }, book.id)).rejects.toMatchObject({ code: "page-mismatch" });
    expect(provider.requests).toHaveLength(2);
    expect(await data.repo.getBookById(book.id)).toEqual(book);
  });

  it("stores nothing when the provider fails", async () => {
    const book = await englishBook();
    const provider = fakeProvider([new Error("boom")]);
    await expect(translateBook({ repo: data.repo, text: provider }, book.id)).rejects.toMatchObject({ code: "provider" });
    expect(provider.requests).toHaveLength(1);
    expect(await data.repo.getBookById(book.id)).toEqual(book);
  });

  it("with the mock provider changes nothing and says it is a mock", async () => {
    const book = await englishBook();
    const generate = vi.spyOn(mockTextProvider, "generate");
    const result = await translateBook({ repo: data.repo, text: mockTextProvider }, book.id, { translator: "דנה" });
    expect(result).toMatchObject({ status: "mock", isMock: true });
    expect(generate).not.toHaveBeenCalled();
    const stored = await data.repo.getBookById(book.id);
    expect(stored).toEqual(book);
    expect(stored?.language).toBe("en");
    expect(stored?.credits?.translator).toBeUndefined();
  });

  it("never stores data from a provider that reports mock output", async () => {
    const book = await englishBook();
    const lying: TextProvider = {
      name: "half-mock",
      isMock: false,
      generate: async (request) => ({ data: request.schema.parse(goodOutput()), isMock: true }),
    };
    expect(await translateBook({ repo: data.repo, text: lying }, book.id)).toMatchObject({ status: "mock" });
    expect(await data.repo.getBookById(book.id)).toEqual(book);
  });

  it("refuses a Hebrew book with no source text, and a book that changed during the call", async () => {
    const hebrew = await data.repo.createBook({ title: "ספר", ownerId: "u_owner", pages: [{ index: 0, text: "שלום" }] });
    await expect(translateBook({ repo: data.repo, text: fakeProvider([goodOutput()]) }, hebrew.id)).rejects.toMatchObject({
      code: "nothing-to-translate",
    });

    const book = await englishBook();
    const racing: TextProvider = {
      name: "slow",
      isMock: false,
      async generate(request) {
        const current = await data.repo.getBookById(book.id);
        await data.repo.replacePages(book.id, (current?.pages ?? []).slice(0, 2));
        return { data: request.schema.parse({ ...goodOutput(), pages: goodOutput().pages }), isMock: false };
      },
    };
    await expect(translateBook({ repo: data.repo, text: racing }, book.id)).rejects.toMatchObject({ code: "changed-meanwhile" });
    expect((await data.repo.getBookById(book.id))?.language).toBe("en");
  });

  it("refuses to translate a book whose license forbids derivatives", async () => {
    const book = await englishBook({ license: "CC BY-ND 4.0" });
    const provider = fakeProvider([goodOutput()]);
    await expect(translateBook({ repo: data.repo, text: provider }, book.id)).rejects.toMatchObject({ code: "license-forbids" });
    await expect(acceptManualTranslation({ repo: data.repo }, book.id, { translator: "דנה" })).rejects.toMatchObject({
      code: "license-forbids",
    });
    expect(provider.requests).toHaveLength(0);
    expect(await data.repo.getBookById(book.id)).toEqual(book);
  });

  it("translates again from the stored original, not from the edited Hebrew", async () => {
    const book = await englishBook();
    await translateBook({ repo: data.repo, text: fakeProvider([goodOutput()]) }, book.id);
    const translated = await data.repo.getBookById(book.id);
    expect(translationSource(translated as BookWithPages)).toMatchObject({
      language: "en",
      title: "Sleepy Mr Sloth",
      pages: [{ text: ENGLISH[0].text }, { text: ENGLISH[1].text }, { text: ENGLISH[3].text }],
    });
  });

  it("blocks an untranslated book from submission and approval, and a translated one without a translator", async () => {
    const book = await englishBook();
    expect(publishProblems(book).map((problem) => problem.code)).toContain("language");
    expect(missingPublishCredits(book).join(" ")).toMatch(/לא בעברית/);

    const noTranslator: BookWithPages = { ...book, language: "he" };
    expect(publishProblems(noTranslator).map((problem) => problem.code)).toContain("translator");
    expect(missingPublishCredits(noTranslator).join(" ")).toMatch(/מתרגם/);

    await translateBook({ repo: data.repo, text: fakeProvider([goodOutput()]) }, book.id);
    const translated = (await data.repo.getBookById(book.id)) as BookWithPages;
    const codes = publishProblems(translated).map((problem) => problem.code);
    expect(codes).not.toContain("language");
    expect(codes).not.toContain("translator");
    expect(publishBlockers(translated)).toEqual([]);

    // Books stored before the language field existed are Hebrew.
    const old = await data.repo.createBook({ title: "ישן", ownerId: "u_owner", license: "x", source: "y", pages: [{ index: 0, text: "שלום" }] });
    expect(old.language).toBeUndefined();
    expect(publishBlockers(old)).toEqual([]);
  });

  describe("manual translation", () => {
    it("needs a translator name and Hebrew on every page", async () => {
      const book = await englishBook();
      await expect(acceptManualTranslation({ repo: data.repo }, book.id, { translator: " " })).rejects.toMatchObject({
        code: "translator-required",
      });
      await expect(acceptManualTranslation({ repo: data.repo }, book.id, { translator: "דנה" })).rejects.toMatchObject({
        code: "not-hebrew",
        pageIndexes: [0, 1, 3],
      });

      const pages = book.pages.map((page, i) => (page.text ? { ...page, text: i === 1 ? "Mostly English text כאן" : "טקסט בעברית" } : page));
      await data.repo.replacePages(book.id, pages);
      await expect(acceptManualTranslation({ repo: data.repo }, book.id, { translator: "דנה" })).rejects.toMatchObject({
        pageIndexes: [1],
      });

      await data.repo.replacePages(book.id, pages.map((page) => (page.text ? { ...page, text: "טקסט בעברית" } : page)));
      await expect(acceptManualTranslation({ repo: data.repo }, book.id, { translator: "דנה" })).rejects.toBeInstanceOf(TranslationError);
      await data.repo.updateBook(book.id, { title: "מר עצלן" });

      const accepted = await acceptManualTranslation({ repo: data.repo }, book.id, { translator: "דנה" });
      expect(accepted).toMatchObject({
        language: "he",
        originalLanguage: "en",
        credits: { translator: "דנה", adaptation: "Translation into Hebrew by דנה", publisher: "Book Dash" },
      });
      expect(accepted.pages[0].originalText).toBe(ENGLISH[0].text);
      await expect(acceptManualTranslation({ repo: data.repo }, book.id, { translator: "דנה" })).rejects.toMatchObject({
        code: "already-hebrew",
      });
    });
  });

  describe("POST /api/studio/books/[id]/translate", () => {
    const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
    const stranger: User = { id: "u_other", name: "אחר", role: "parent" };
    const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

    function request(body: unknown, origin = "http://localhost"): Request {
      return new Request("http://localhost/api/studio/books/x/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    }
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

    it("requires sign-in, same origin and edit rights", async () => {
      const book = await englishBook();
      routeProvider = fakeProvider([goodOutput()]);

      expect((await translateRoute(request({}), ctx(book.id))).status).toBe(401);
      currentUser = stranger;
      expect((await translateRoute(request({}), ctx(book.id))).status).toBe(404);
      currentUser = owner;
      expect((await translateRoute(request({}, "http://evil.example"), ctx(book.id))).status).toBe(403);
      expect((await translateRoute(request({ action: "nope" }), ctx(book.id))).status).toBe(400);
      expect((await data.repo.getBookById(book.id))?.language).toBe("en");
    });

    it("translates for the owner and for an editor, and reports the mock without changing the book", async () => {
      const book = await englishBook();
      currentUser = owner;

      const mock = await translateRoute(request({ translator: "דנה" }), ctx(book.id));
      expect(mock.status).toBe(200);
      expect(await mock.json()).toMatchObject({ status: "mock", isMock: true, book: { language: "en", title: "Sleepy Mr Sloth" } });
      expect(await data.repo.getBookById(book.id)).toEqual(book);

      routeProvider = fakeProvider([goodOutput()]);
      currentUser = editor;
      const real = await translateRoute(request({ translator: "דנה" }), ctx(book.id));
      expect(real.status).toBe(200);
      expect(await real.json()).toMatchObject({
        status: "translated",
        isMock: false,
        book: { language: "he", title: "מר עצלן הישנוני", credits: { translator: "דנה" } },
      });
    });

    it("is refused for a published book unless the caller is an editor", async () => {
      const book = await englishBook();
      // Force the state directly: the application itself never publishes an English book.
      await data.repo.updateBook(book.id, { status: "published" });
      routeProvider = fakeProvider([goodOutput()]);

      currentUser = owner;
      const refused = await translateRoute(request({}), ctx(book.id));
      expect(refused.status).toBe(409);
      expect((await data.repo.getBookById(book.id))?.language).toBe("en");

      currentUser = editor;
      expect((await translateRoute(request({}), ctx(book.id))).status).toBe(200);
    });

    it("accepts a manual translation and maps its errors to 400", async () => {
      const book = await englishBook();
      currentUser = owner;
      const missing = await translateRoute(request({ action: "accept", translator: "דנה" }), ctx(book.id));
      expect(missing.status).toBe(400);
      expect(await missing.json()).toMatchObject({ details: { code: "not-hebrew", pageIndexes: [0, 1, 3] } });

      await data.repo.replacePages(book.id, book.pages.map((page) => (page.text ? { ...page, text: "טקסט בעברית" } : page)));
      await data.repo.updateBook(book.id, { title: "מר עצלן" });
      const accepted = await translateRoute(request({ action: "accept", translator: "דנה" }), ctx(book.id));
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ status: "accepted", book: { language: "he", credits: { translator: "דנה" } } });
    });
  });
});
