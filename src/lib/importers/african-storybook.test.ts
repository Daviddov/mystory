import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import {
  AFRICAN_STORYBOOK,
  AfricanStorybookClient,
  africanStorybookLicenseName,
  africanStorybookNumber,
  findAfricanStorybookBook,
  guessAfricanStorybookFile,
  importAfricanStorybookBook,
  parseAfricanStorybookImageIndex,
  parseAfricanStorybookIndex,
  parseAfricanStorybookStory,
} from "./african-storybook";
import type { FetchLike } from "./bookdash";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
/** Copied unchanged from global-asp/asp-source (master): en/0010_the-animals-of-uganda.md. */
const UGANDA_MD = readFileSync(path.join(FIXTURES, "african-storybook-0010.md"), "utf8");
/** The head of en/README.md and four real rows (0001, 0002, 0010, 0047). */
const README = readFileSync(path.join(FIXTURES, "african-storybook-readme.md"), "utf8");
/** The table head of the image bank's README.md and the same four rows. */
const IMAGE_README = readFileSync(path.join(FIXTURES, "african-storybook-imagebank-readme.md"), "utf8");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

interface StubResponse {
  status?: number;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
}

/** A fetch that serves a fixed map of URLs and records every request. Unknown URLs are 404. */
function stubFetch(routes: Record<string, StubResponse>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url] ?? { status: 404, body: "Not Found" };
    const status = route.status ?? 200;
    const body = route.body ?? "";
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => route.headers?.[name.toLowerCase()] ?? null },
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };
  };
  return { fetch, calls };
}

const SOURCE = `${AFRICAN_STORYBOOK.sourceRawBase}/en`;
const imageUrl = (number: string, index: number) => `${AFRICAN_STORYBOOK.imageRawBase}/medium/${number}/${String(index).padStart(2, "0")}.jpg`;

/** Story 0010 as the repositories hold it: 9 pages and `images` pictures (really 11: cover, 9 pages, back cover). */
function ugandaRoutes(images = 11, extra: Record<string, StubResponse> = {}): Record<string, StubResponse> {
  const routes: Record<string, StubResponse> = {
    [`${SOURCE}/README.md`]: { body: README },
    [`${SOURCE}/0010_the-animals-of-uganda.md`]: { body: UGANDA_MD },
    [`${AFRICAN_STORYBOOK.imageRawBase}/README.md`]: { body: IMAGE_README },
  };
  for (let i = 1; i <= images; i++) routes[imageUrl("0010", i)] = { body: JPEG };
  return { ...routes, ...extra };
}

describe("parseAfricanStorybookStory", () => {
  it("reads the real Animals of Uganda file: title, 9 pages of plain text and the metadata", () => {
    const story = parseAfricanStorybookStory(UGANDA_MD);
    expect(story.title).toBe("The Animals of Uganda");
    expect(story.pages).toHaveLength(9);
    // Lines wrapped by the PDF are joined; no markdown, page break or metadata leaks into the story.
    expect(story.pages[0]).toBe("This is the giraffe. It has a very long neck. It eats leaves from tall trees. What colour is the giraffe?");
    expect(story.pages[8]).toBe("What are these two animal friends? Where do they live? Which one would you eat?");
    for (const text of story.pages) expect(text).not.toMatch(/[#*\r\n]|License|  /);
    expect(story).toMatchObject({
      license: "CC BY",
      author: "Wendy Parry",
      illustrator: "Rob Owen",
      adaptation: "Wendy Parry",
      translator: "",
      language: "en",
      description: "First paragraph story about animals found in Uganda",
      warnings: [],
    });
  });

  it("keeps the position of a page without text, separates paragraphs and strips inline markdown", () => {
    const md = [
      "# Hare and *Hyena*",
      "",
      "##",
      "Hare was",
      "hungry.",
      "",
      "",
      "_He sang a song._",
      "",
      "##",
      "",
      "##  ",
      "I was out picking fruits.",
      "",
      "##",
      "* License: [CC-BY-NC]",
      "* Text: Traditional San story",
      "* Translated By: Ursula Nafula",
      "* Language: en",
    ].join("\n");
    const story = parseAfricanStorybookStory(md);
    expect(story.title).toBe("Hare and Hyena");
    expect(story.pages).toEqual(["Hare was hungry.\nHe sang a song.", "", "I was out picking fruits."]);
    expect(story).toMatchObject({ license: "CC BY-NC", author: "Traditional San story", illustrator: "", translator: "Ursula Nafula" });
    expect(story.warnings).toEqual(["the metadata names no illustrator", "page 2 has a picture but no text"]);
  });

  it("does not take the last page for metadata when the file has none", () => {
    const story = parseAfricanStorybookStory("# T\n\n##\nOne.\n\n##\nTwo.\n");
    expect(story.pages).toEqual(["One.", "Two."]);
    expect(story.license).toBe("");
    expect(story.warnings).toContain("the story file has no metadata section");
  });
});

describe("license and index parsing", () => {
  it("normalises license names and refuses anything that is not a CC BY family name", () => {
    expect(africanStorybookLicenseName("[CC-BY]")).toBe("CC BY");
    expect(africanStorybookLicenseName("[CC-BY-NC]")).toBe("CC BY-NC");
    expect(africanStorybookLicenseName("CC BY-NC-SA")).toBe("CC BY-NC-SA");
    expect(africanStorybookLicenseName("All rights reserved")).toBe("");
  });

  it("takes the license version from the link of the README and nowhere else", () => {
    const index = parseAfricanStorybookIndex(README);
    expect([...index.keys()]).toEqual(["0001", "0002", "0010", "0047"]);
    expect(index.get("0010")).toEqual({
      number: "0010",
      title: "The Animals of Uganda",
      license: "CC BY 4.0",
      storyUrl: "http://africanstorybook.org/stories/animals-uganda-6",
    });
    expect(index.get("0001")?.license).toBe("CC BY 3.0");
    expect(index.get("0002")?.license).toBe("CC BY-NC 3.0");
    // A label that disagrees with its link is no license at all.
    const odd = parseAfricanStorybookIndex("0099 | [X](http://example.org/x) | [CC-BY](https://creativecommons.org/licenses/by-nc/4.0/)");
    expect(odd.get("0099")?.license).toBe("");
  });

  it("reads illustrators and picture licenses of the image bank", () => {
    const index = parseAfricanStorybookImageIndex(IMAGE_README);
    expect(index.get("0010")).toEqual({ number: "0010", illustrator: "Rob Owen", license: "CC BY" });
    expect(index.get("0047")?.license).toBe("CC BY-NC");
  });

  it("accepts story numbers in several spellings and guesses file names from titles", () => {
    expect(africanStorybookNumber("10")).toBe("0010");
    expect(africanStorybookNumber("asp-0010")).toBe("0010");
    expect(africanStorybookNumber("0010_the-animals-of-uganda.md")).toBe("0010");
    expect(africanStorybookNumber("../10")).toBeNull();
    expect(africanStorybookNumber("0")).toBeNull();
    expect(guessAfricanStorybookFile("0010", "The Animals of Uganda")).toBe("0010_the-animals-of-uganda.md");
    expect(guessAfricanStorybookFile("0054", "How tortoise's nose became crooked")).toBe("0054_how-tortoises-nose-became-crooked.md");
  });
});

describe("importAfricanStorybookBook", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  const run = (fetch: FetchLike, id = "10", force = false) =>
    importAfricanStorybookBook({ id, ownerId: "system", repo: data.repo, media: data.media, client: new AfricanStorybookClient({ fetch }), force });

  it("creates an English draft: picture N + 1 on page N, the cover apart, the back cover left out", async () => {
    const { fetch, calls } = stubFetch(ugandaRoutes());
    const result = await run(fetch);
    expect(result.status).toBe("created");
    expect(result.warnings).toEqual([]);
    const book = result.book;
    expect(book).toMatchObject({
      id: "asp-0010",
      slug: "asp-0010-the-animals-of-uganda",
      title: "The Animals of Uganda",
      summary: "First paragraph story about animals found in Uganda",
      status: "draft",
      origin: "import",
      ownerId: "system",
      language: "en",
      originalLanguage: "en",
      license: "CC BY 4.0",
      source: "https://github.com/global-asp/asp-source/blob/master/en/0010_the-animals-of-uganda.md",
      author: "Wendy Parry",
      illustrator: "Rob Owen",
      coverImage: "books/asp-0010/cover.jpg",
      credits: {
        publisher: "African Storybook",
        publisherUrl: "https://www.africanstorybook.org",
        originalTitle: "The Animals of Uganda",
        adaptation: "Adaptation: Wendy Parry",
      },
    });
    expect(book.credits?.translator).toBeUndefined();
    expect(book.credits?.attributionLine).toBeUndefined();
    expect(book.pages).toHaveLength(9);
    expect(book.pages[0]).toEqual({
      index: 0,
      text: "This is the giraffe. It has a very long neck. It eats leaves from tall trees. What colour is the giraffe?",
      originalText: "This is the giraffe. It has a very long neck. It eats leaves from tall trees. What colour is the giraffe?",
      image: "books/asp-0010/page-01.jpg",
    });
    expect(await data.media.list("books/asp-0010")).toHaveLength(10);
    // Page 1 took picture 02, page 9 picture 10; picture 11 (the back cover) was never asked for.
    expect(calls).toContain(imageUrl("0010", 2));
    expect(calls).toContain(imageUrl("0010", 10));
    expect(calls).not.toContain(imageUrl("0010", 11));
    // The file name was found from the README title: no GitHub API request.
    expect(calls.every((url) => url.startsWith("https://raw.githubusercontent.com/"))).toBe(true);
    expect(await findAfricanStorybookBook(data.repo, "asp-0010")).toEqual(book);
  });

  it("is idempotent, and accepts a story without a back cover picture", async () => {
    const { fetch, calls } = stubFetch(ugandaRoutes(10));
    expect((await run(fetch)).status).toBe("created");
    const requests = calls.length;
    expect((await run(fetch, "0010")).status).toBe("skipped");
    expect(calls).toHaveLength(requests);
    expect((await run(fetch, "10", true)).status).toBe("replaced");
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(1);
  });

  it("finds a story file with an unexpected name through one API listing", async () => {
    const routes = ugandaRoutes();
    delete routes[`${SOURCE}/0010_the-animals-of-uganda.md`];
    routes[`${SOURCE}/0010_animals.of_uganda.md`] = { body: UGANDA_MD };
    routes[`${AFRICAN_STORYBOOK.apiBase}/en?ref=master`] = {
      body: JSON.stringify([
        { name: "README.md", type: "file" },
        { name: "0010_animals.of_uganda.md", type: "file" },
      ]),
    };
    const { fetch, calls } = stubFetch(routes);
    const result = await run(fetch);
    expect(result.book.source).toBe("https://github.com/global-asp/asp-source/blob/master/en/0010_animals.of_uganda.md");
    expect(result.book.slug).toBe("asp-0010-animals-of-uganda");
    expect(calls.filter((url) => url.startsWith(AFRICAN_STORYBOOK.apiBase))).toHaveLength(1);
  });

  it("refuses CC BY-NC and stories outside the README before downloading the story", async () => {
    const { fetch, calls } = stubFetch(ugandaRoutes());
    // 0001 is CC BY 3.0, which is accepted since cc.ts lists it; it fails later only because the stub has no story file.
    await expect(run(fetch, "2")).rejects.toMatchObject({ code: "license" });
    await expect(run(fetch, "365")).rejects.toMatchObject({ code: "license" });
    expect([...new Set(calls)]).toEqual([`${SOURCE}/README.md`]);
    await expect(run(fetch, "../x")).rejects.toMatchObject({ code: "invalid-id" });
  });

  it("refuses a story whose file or pictures carry another license than the README", async () => {
    // Real case: the README lists 0047 as CC BY 4.0, the file and the image bank say CC BY-NC.
    const nc = UGANDA_MD.replace("[CC-BY]", "[CC-BY-NC]");
    const first = stubFetch(ugandaRoutes(11, { [`${SOURCE}/0047_my-new-shirt.md`]: { body: nc } }));
    await expect(run(first.fetch, "47")).rejects.toMatchObject({ code: "license" });

    const pictures = IMAGE_README.replace("**Rob Owen** | CC BY", "**Rob Owen** | CC BY-NC");
    const second = stubFetch(ugandaRoutes(11, { [`${AFRICAN_STORYBOOK.imageRawBase}/README.md`]: { body: pictures } }));
    await expect(run(second.fetch)).rejects.toMatchObject({ code: "license" });
    expect(second.calls.some((url) => url.endsWith(".jpg"))).toBe(false);
    expect(await data.media.list("books/asp-0010")).toEqual([]);
  });

  it("stores nothing when the pictures are missing or cannot be matched to the pages", async () => {
    await expect(run(stubFetch(ugandaRoutes(0)).fetch)).rejects.toMatchObject({ code: "no-images" });
    // Fewer pictures than pages + cover.
    await expect(run(stubFetch(ugandaRoutes(9)).fetch)).rejects.toMatchObject({ code: "invalid-book" });
    // More than pages + cover + back cover.
    await expect(run(stubFetch(ugandaRoutes(12)).fetch)).rejects.toMatchObject({ code: "invalid-book" });
    await expect(run(stubFetch(ugandaRoutes(11, { [imageUrl("0010", 5)]: { body: "<svg xmlns='http://www.w3.org/2000/svg'/>" } })).fetch)).rejects.toMatchObject({
      code: "media",
    });
    expect(await findAfricanStorybookBook(data.repo, "10")).toBeNull();
    expect(await data.media.list("books/asp-0010")).toEqual([]);
  });
});
