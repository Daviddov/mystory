/** "Add a language": translateToLanguage, saveVersionText, narrateVersionPage, removeVersion. No real model or voice. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockTextProvider, mockTtsProvider } from "@/lib/ai/mock";
import type { TextProvider, TextRequest } from "@/lib/ai/types";
import { createTempData, type TempData } from "@/test/temp-data";
import { bookVersions, pageVersion, type BookWithPages } from "@/lib/types";
import { TranslationError } from "./index";
import { narrateVersionPage, removeVersion, saveVersionText, translateToLanguage } from "./versions";

function provider(output: unknown): TextProvider & { requests: TextRequest<unknown>[] } {
  const requests: TextRequest<unknown>[] = [];
  return {
    name: "fake",
    isMock: false,
    requests,
    async generate<T>(request: TextRequest<T>) {
      requests.push(request as TextRequest<unknown>);
      return { data: request.schema.parse(output), isMock: false, usage: { costUsd: 0.01 } };
    },
  };
}

const ENGLISH = { title: "Sleepy Sloth", summary: "He sleeps.", pages: [{ page: 1, text: "Good night, sloth." }, { page: 2, text: "Sleep tight." }] };
const ARABIC = { title: "الكسلان النعسان", summary: "ينام الكسلان.", pages: [{ page: 1, text: "تصبح على خير يا كسلان." }, { page: 2, text: "نم جيدا." }] };

describe("language versions", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  async function hebrewBook(): Promise<BookWithPages> {
    return data.repo.createBook({
      title: "הדוב הישנוני",
      summary: "הדוב ישן.",
      ownerId: "u",
      origin: "manual",
      license: "כל הזכויות שמורות",
      source: "x",
      categories: [],
      pages: [
        { index: 0, text: "לילה טוב דוב.", textNikud: "לַיְלָה טוֹב דֹּב.", audio: "books/x/he-1.mp3", audioSource: "tts" },
        { index: 1, text: "לישון טוב." },
      ],
    });
  }

  it("translates the whole book in one call and keeps the Hebrew text and narration", async () => {
    const book = await hebrewBook();
    const text = provider(ARABIC);
    const result = await translateToLanguage({ repo: data.repo, text }, book.id, "ar", { translator: "Dana" });
    expect(result.status).toBe("translated");
    expect(text.requests).toHaveLength(1);
    expect(text.requests[0].system).toMatch(/from Hebrew into Arabic/);
    const saved = (await data.repo.getBookById(book.id))!;
    expect(saved.title).toBe("הדוב הישנוני");
    expect(saved.pages[0].audio).toBe("books/x/he-1.mp3");
    expect(saved.pages[0].textNikud).toBeTruthy();
    expect(saved.translation).toMatchObject({ language: "ar", title: "الكسلان النعسان", translator: "Dana" });
    expect(pageVersion(saved, saved.pages[1], "ar")?.text).toBe("نم جيدا.");
  });

  it("puts a second language in extraTranslations", async () => {
    const book = await hebrewBook();
    await translateToLanguage({ repo: data.repo, text: provider(ARABIC) }, book.id, "ar");
    await translateToLanguage({ repo: data.repo, text: provider(ENGLISH) }, book.id, "en");
    const saved = (await data.repo.getBookById(book.id))!;
    expect(bookVersions(saved).map((v) => v.language)).toEqual(["ar", "en"]);
    expect(pageVersion(saved, saved.pages[0], "en")?.text).toBe("Good night, sloth.");
    expect(pageVersion(saved, saved.pages[0], "ar")?.text).toBe("تصبح على خير يا كسلان.");
  });

  it("refuses the book's own language, a wrong script and a mock provider", async () => {
    const book = await hebrewBook();
    await expect(translateToLanguage({ repo: data.repo, text: provider(ARABIC) }, book.id, "he")).rejects.toBeInstanceOf(TranslationError);
    await expect(translateToLanguage({ repo: data.repo, text: provider(ENGLISH) }, book.id, "ar")).rejects.toMatchObject({ code: "page-mismatch" });
    const mock = await translateToLanguage({ repo: data.repo, text: mockTextProvider }, book.id, "ar");
    expect(mock.status).toBe("mock");
    expect((await data.repo.getBookById(book.id))!.translation).toBeUndefined();
  });

  it("narrates a page of a version and a changed text drops its narration", async () => {
    const book = await hebrewBook();
    await translateToLanguage({ repo: data.repo, text: provider(ENGLISH) }, book.id, "en");
    const out = await narrateVersionPage({ repo: data.repo, media: data.media, tts: mockTtsProvider }, book.id, "en", 0);
    expect(out.status).toBe("narrated");
    let saved = (await data.repo.getBookById(book.id))!;
    const v = pageVersion(saved, saved.pages[0], "en")!;
    expect(v.audio).toMatch(/narration-en-01-/);
    expect(v.audioSource).toBe("mock");
    expect(saved.pages[0].audio).toBe("books/x/he-1.mp3");

    await saveVersionText({ repo: data.repo, media: data.media }, book.id, "en", {
      title: "Sleepy Sloth",
      pages: ["Good night, little sloth.", "Sleep tight."],
    });
    saved = (await data.repo.getBookById(book.id))!;
    expect(pageVersion(saved, saved.pages[0], "en")?.audio).toBeUndefined();
  });

  it("removes a version and keeps the others", async () => {
    const book = await hebrewBook();
    await translateToLanguage({ repo: data.repo, text: provider(ARABIC) }, book.id, "ar");
    await translateToLanguage({ repo: data.repo, text: provider(ENGLISH) }, book.id, "en");
    await removeVersion({ repo: data.repo, media: data.media }, book.id, "ar");
    const saved = (await data.repo.getBookById(book.id))!;
    expect(bookVersions(saved).map((v) => v.language)).toEqual(["en"]);
    expect(saved.translation?.language).toBe("en");
    expect(pageVersion(saved, saved.pages[0], "en")?.text).toBe("Good night, sloth.");
    expect(pageVersion(saved, saved.pages[0], "ar")).toBeUndefined();
  });
});
