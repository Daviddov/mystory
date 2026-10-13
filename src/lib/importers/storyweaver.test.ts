import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { FetchLike } from "./bookdash";
import {
  STORYWEAVER,
  StoryWeaverClient,
  StoryWeaverError,
  extractReaderHtml,
  findStoryWeaverBook,
  fixLeadingPunctuation,
  importStoryWeaverBook,
  parseStoryWeaverReader,
  storyWeaverBookId,
} from "./storyweaver";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
/** Copied unchanged from storyweaver.org.in: the reader script of 7960-hamilich-hashim-vihakiliv-harazi. */
const READER_JS = readFileSync(path.join(FIXTURES, "storyweaver-fat-king-reader.js"), "utf8");
const SLUG = "7960-hamilich-hashim-vihakiliv-harazi";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** Serves the fixture story; every illustration URL answers with a tiny JPEG. Unknown URLs are 404. */
function stubFetch(overrides: { reader?: string; language?: string } = {}): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const details = {
    ok: true,
    data: {
      name: "המלך השמן והכלב הרזה",
      language: overrides.language ?? "Hebrew",
      level: "1",
      description: "בוא נרוץ ביחד עם המלך אחרי הכלב הרזה",
      originalStory: { name: "Fat King Thin Dog", originalPublisher: { name: "Pratham Books" } },
    },
  };
  const routes: Record<string, string> = {
    [`${STORYWEAVER.base}/api/v1/stories/${SLUG}`]: JSON.stringify(details),
    [`${STORYWEAVER.base}/v0/stories/show-in-iframe/${SLUG}?iframe=true`]: `<a class="stories-link" href="/en/v0/stories/${SLUG}/pages/90040" data-remote=true>`,
    [`${STORYWEAVER.base}/v0/stories/${SLUG}/pages/90040`]: overrides.reader ?? READER_JS,
  };
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const isImage = url.startsWith(STORYWEAVER.imageBase);
    const body = isImage ? JPEG : routes[url];
    const bytes = body === undefined ? new Uint8Array() : typeof body === "string" ? new TextEncoder().encode(body) : body;
    const status = body === undefined ? 404 : 200;
    return {
      ok: status === 200,
      status,
      headers: { get: () => null },
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };
  };
  return { fetch, calls };
}

describe("parseStoryWeaverReader", () => {
  const parsed = parseStoryWeaverReader(extractReaderHtml(READER_JS), "he");

  it("reads the real Fat King story: title, cover, seven pages and their pictures", () => {
    expect(parsed.title).toBe("המלך השמן והכלב הרזה");
    expect(parsed.coverImageUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/static\.storyweaver\.org\.in\/illustration_crops\/13829\/size7\//);
    expect(parsed.pages).toHaveLength(7);
    expect(parsed.pages.every((page) => page.imageUrl?.startsWith(STORYWEAVER.imageBase))).toBe(true);
    expect(parsed.warnings).toEqual([]);
    // No markup leaks into the story.
    for (const page of parsed.pages) expect(page.text).not.toMatch(/[<>&]|\d\/8/);
  });

  it("moves a full stop that was typed before the sentence to its end, and keeps line breaks", () => {
    expect(parsed.pages[0].text).toBe("זהו מלך שמן.");
    expect(parsed.pages[1].text).toBe("יש למלך השמן כלב רזה.\nהמלך השמן והכלב הרזה יצאו לטיול.");
  });

  it("takes the people from the cover and the license and attribution from the back cover", () => {
    expect(parsed.contributors).toEqual({
      "Original Publisher": "Pratham Books",
      Author: "Parismita",
      Illustrator: "Parismita",
      Translator: "Ali Ayoub",
    });
    expect(parsed.license).toBe("CC BY 4.0");
    expect(parsed.illustrationLicenses).toEqual(["CC BY 4.0"]);
    expect(parsed.attribution).toContain("is translated by Ali Ayoub.");
    expect(parsed.attribution).toContain("© Pratham Books, 2007. Some rights reserved. Released under CC BY 4.0 license.");
    expect(parsed.synopsis).toBe("בוא נרוץ ביחד עם המלך אחרי הכלב הרזה");
  });
});

describe("fixLeadingPunctuation", () => {
  it("only moves a single closing mark of a line that has none at its end", () => {
    expect(fixLeadingPunctuation(".זהו מלך שמן")).toBe("זהו מלך שמן.");
    expect(fixLeadingPunctuation("!רוץ")).toBe("רוץ!");
    expect(fixLeadingPunctuation("...ואז הוא רץ")).toBe("...ואז הוא רץ");
    expect(fixLeadingPunctuation(".כבר יש נקודה.")).toBe(".כבר יש נקודה.");
    expect(fixLeadingPunctuation("משפט רגיל.")).toBe("משפט רגיל.");
  });
});

describe("importStoryWeaverBook", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  it("stores a Hebrew draft with credits and one stored file per distinct illustration, and skips it the second time", async () => {
    const { fetch } = stubFetch();
    const client = new StoryWeaverClient({ fetch });
    const result = await importStoryWeaverBook({ slug: SLUG, ownerId: "system", repo: data.repo, media: data.media, client });
    expect(result.status).toBe("created");
    const { book } = result;
    expect(book.id).toBe(storyWeaverBookId(SLUG));
    expect(book).toMatchObject({
      id: "storyweaver-7960",
      status: "draft",
      origin: "import",
      title: "המלך השמן והכלב הרזה",
      author: "Parismita",
      illustrator: "Parismita",
      license: "CC BY 4.0",
      source: `https://storyweaver.org.in/stories/${SLUG}`,
      coverImage: "books/storyweaver-7960/cover.jpg",
    });
    expect(book.language).toBeUndefined();
    expect(book.credits).toMatchObject({ publisher: "Pratham Books", translator: "Ali Ayoub", originalTitle: "Fat King Thin Dog" });
    expect(book.pages).toHaveLength(7);
    expect(book.pages[6].text).toBe("ועכשיו המלך רזה.");
    for (const page of book.pages) expect(await data.media.get(page.image!)).not.toBeNull();

    const again = await importStoryWeaverBook({ slug: SLUG, ownerId: "system", repo: data.repo, media: data.media, client });
    expect(again.status).toBe("skipped");
    expect((await findStoryWeaverBook(data.repo, SLUG))?.id).toBe(book.id);
  });

  it("refuses a story whose license forbids adaptations and stores nothing", async () => {
    const reader = READER_JS.replaceAll("Released under CC BY 4.0 license", "Released under CC BY-NC-ND 4.0 license");
    const client = new StoryWeaverClient({ fetch: stubFetch({ reader }).fetch });
    const attempt = importStoryWeaverBook({ slug: SLUG, ownerId: "system", repo: data.repo, media: data.media, client });
    await expect(attempt).rejects.toMatchObject({ name: "StoryWeaverError", code: "license" });
    expect(await findStoryWeaverBook(data.repo, SLUG)).toBeNull();
  });

  it("refuses a language the site cannot hold, and a slug that is not a StoryWeaver slug", async () => {
    const client = new StoryWeaverClient({ fetch: stubFetch({ language: "Hindi" }).fetch });
    const base = { ownerId: "system", repo: data.repo, media: data.media, client };
    await expect(importStoryWeaverBook({ ...base, slug: SLUG })).rejects.toMatchObject({ code: "language" });
    await expect(importStoryWeaverBook({ ...base, slug: "../etc/passwd" })).rejects.toBeInstanceOf(StoryWeaverError);
  });
});
