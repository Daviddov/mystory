import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishProblems } from "@/lib/studio/shared";
import { createTempData, type TempData } from "@/test/temp-data";
import type { FetchLike } from "./bookdash";
import {
  GDL,
  GdlClient,
  GdlError,
  findGdlBook,
  gdlBookId,
  gdlCatalogueProblem,
  gdlLicensesInText,
  gdlSkippedPublisher,
  importGdlBook,
  normalizeGdlLicense,
  parseGdlBook,
  parseGdlCatalogue,
} from "./gdl";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
/**
 * Real answers of content-api/v1/h5p/<id>, without their "filtered" field (a second copy of "params"):
 * 14051 "Peter's Peanuts" (Bilum Books, CC BY 4.0) and 14191 "Puppy's Story", which the catalogue lists
 * as CC-BY-4.0 while its own credits page says CC-BY-NC-4.0.
 */
const PEANUTS = readFileSync(path.join(FIXTURES, "gdl-book-14051.json"), "utf8");
const PUPPY = readFileSync(path.join(FIXTURES, "gdl-book-14191.json"), "utf8");
/** Five real entries of content-api/v1/books/en: the two books above, a CC BY-SA book, a Book Dash book and a video. */
const CATALOGUE = readFileSync(path.join(FIXTURES, "gdl-catalogue.json"), "utf8");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

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

const PEANUTS_IMAGES = `${GDL.mediaBase}/14051/images`;

function peanutsRoutes(extra: Record<string, StubResponse> = {}): Record<string, StubResponse> {
  const routes: Record<string, StubResponse> = {
    [`${GDL.apiBase}/books/en`]: { body: CATALOGUE },
    [`${GDL.apiBase}/h5p/14051`]: { body: PEANUTS },
    [`${GDL.apiBase}/h5p/14191`]: { body: PUPPY },
    [`${PEANUTS_IMAGES}/coverImage.png`]: { body: PNG },
  };
  for (let i = 2; i <= 12; i++) routes[`${PEANUTS_IMAGES}/p-${i}.jpg`] = { body: JPEG };
  return { ...routes, ...extra };
}

describe("normalizeGdlLicense and gdlLicensesInText", () => {
  it("gives every spelling of a license one name", () => {
    expect(["CC-BY-4.0", "cc-by-4-0", "CC BY 4.0", "CC­-BY­-4.0"].map(normalizeGdlLicense)).toEqual(Array(4).fill("CC BY 4.0"));
    expect(normalizeGdlLicense("CC-BY-SA 4.0")).toBe("CC BY-SA 4.0");
    expect(normalizeGdlLicense("cc-by-nc-sa-4-0")).toBe("CC BY-NC-SA 4.0");
    expect(normalizeGdlLicense("CC-BY-3.0")).toBe("CC BY 3.0");
    expect(normalizeGdlLicense("CC BY")).toBe("CC BY");
    expect(normalizeGdlLicense("CC0")).toBe("CC0 1.0");
    expect(normalizeGdlLicense("Copyright")).toBe("Copyright");
  });

  it("finds the licenses a credits page states", () => {
    expect(gdlLicensesInText("© Bilum Books. Released under CC BY 4.0. See http://creativecommons.org/licenses/by/4.0/")).toEqual(["CC BY 4.0"]);
    expect(gdlLicensesInText("Released under CC-BY-NC-4.0. http://creativecommons.org/licenses/by-nc/4.0/")).toEqual(["CC BY-NC 4.0"]);
    expect(gdlLicensesInText("Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International")).toEqual(["CC BY-NC-SA 4.0"]);
    expect(gdlLicensesInText("Text copyright © by the Estate. ALL RIGHTS RESERVED")).toEqual(["All rights reserved"]);
    expect(gdlLicensesInText("Dedicated to the public domain: CC0.")).toEqual(["CC0 1.0"]);
    expect(gdlLicensesInText("Peter stayed with his Uncle Joe.")).toEqual([]);
  });
});

describe("parseGdlBook", () => {
  it("reads the real Peter's Peanuts: 11 story pages, credits from its own pages, no front or back matter", () => {
    const book = parseGdlBook(JSON.parse(PEANUTS));
    expect(book.title).toBe("Peter's Peanuts");
    expect(book.description).toBe(
      "Peter likes peanuts. His Aunty Kila shows Peter how to cook peanuts. Yum! What will Peter do with the peanuts he takes home?",
    );
    expect(book.coverImagePath).toBe("images/coverImage.png");
    expect(book).toMatchObject({
      publisher: "Bilum Books",
      publisherUrl: "http://bilumbooks.com/",
      author: "Tandi Jackson",
      illustrator: "Michael Mape",
      translator: "",
      // The cover lists Tandi Jackson as "Author", which the credits page confirms: nothing is left without a role.
      creators: "",
      statedLicenses: ["CC BY 4.0"],
      itemLicenses: ["CC BY 4.0"],
      warnings: [],
    });
    expect(book.skippedPublisher).toBeUndefined();
    expect(book.attribution).toBe(
      "Original Story Peter's Peanuts, Author: Tandi Jackson. Illustrator: Michael Mape. Published by Bilum Books, http://bilumbooks.com/ © Bilum Books. Released under CC BY 4.0. " +
        "This work is a modified version of the original story. © The Asia Foundation, 2021. Some rights reserved. Released under CC BY 4.0.",
    );

    // Of 17 chapters: the title page, a logo page, the questions page and three credits pages are dropped.
    expect(book.pages).toHaveLength(11);
    expect(book.pages.map((page) => page.imagePath)).toEqual(Array.from({ length: 11 }, (_, i) => `images/p-${i + 2}.jpg`));
    expect(book.pages[2]).toEqual({
      imagePath: "images/p-4.jpg",
      imageAlt: "Aunty Kila puts the peanut plants on a small table placed over a fire. Peter bends over and watches.",
      text: "Peter’s aunty put the peanuts on her fire. She roasted them.",
    });
    expect(book.pages[10].text).toBe("On Saturday, Peter sold them at his mother’s stall.");
    for (const page of book.pages) expect(page.text).not.toMatch(/[<>]|&[a-z#0-9]+;|Comprehension|Brought to you|Released under/);
  });

  it("reads the license the book itself states, whatever the catalogue says, and restores lost line breaks", () => {
    const book = parseGdlBook(JSON.parse(PUPPY));
    expect(book.statedLicenses).toEqual(["CC BY-NC 4.0"]);
    expect(book.publisher).toBe("Kim Dong Publishing House");
    expect(book.publisherUrl).toBe("https://www.nxbkimdong.com.vn/");
    // "Author: ." on the credits page names nobody.
    expect(book.author).toBe("");
    expect(book.illustrator).toBe("CHU ĐỨC THẮng");
    expect(book.pages).toHaveLength(5);
    expect(book.pages[0].text).toBe('Puppy saw Kitten,\nWith just a "Miaow",\nGet fish for herself.');
    expect(book.warnings).toContain("page 3 has a picture but no text");
  });

  it("drops entities and tags, keeps paragraphs, and never gives a cover name a role the pages do not state", () => {
    const item = (library: string, params: unknown, license = "CC BY") => ({
      content: { library, params, metadata: { license, licenseVersion: "4.0" } },
    });
    const chapter = (...content: unknown[]) => ({ library: "H5P.Column 1.12", params: { content } });
    const params = {
      bookCover: {
        coverDescription: "<p>Tom &amp; the moon.</p>\n",
        coverImage: { path: "images/coverImage.jpg", copyright: { license: "CC BY", version: "4.0" } },
        publisher: "Room to Read",
        contributors: [{ name: " Stephanie  Wei", type: "Author" }],
      },
      chapters: [
        chapter(item("H5P.Image 1.1", { file: { path: "images/coverImage.jpg" }, alt: "Tom" }), item("H5P.AdvancedText 1.1", { text: "<p><strong>Tom</strong></p>" })),
        chapter(
          item("H5P.Image 1.1", { file: { path: "images/a.jpg" }, alt: "Tom&#039;s cat. Illustration" }),
          item("H5P.AdvancedText 1.1", { text: "<p>Tom&nbsp;said: &quot;Hi!&quot;</p>\n<p>The cat <em>purred</em>.<br>Twice.</p>" }),
        ),
        chapter(item("H5P.AdvancedText 1.1", { text: "<p>The end.</p>" })),
        chapter(item("H5P.Image 1.1", { file: { path: "images/x.jpg" }, alt: "Storyweaver logo. Screenshot" })),
        chapter(item("H5P.AdvancedText 1.1", { text: "<p>Some rights reserved. This book is CC­-BY­-4.0 licensed.</p>" }), item("H5P.Image 1.1", { file: { path: "images/b.jpg" }, alt: "" }, "U")),
        chapter(item("H5P.Image 1.1", { file: { path: "images/c.jpg" }, alt: "" }, "CC BY-NC")),
      ],
    };
    const book = parseGdlBook({ id: "1", title: "Tom", params: JSON.stringify(params) });
    expect(book.description).toBe("Tom & the moon.");
    expect(book.pages).toEqual([
      { imagePath: "images/a.jpg", imageAlt: "Tom's cat. Illustration", text: 'Tom said: "Hi!"\nThe cat purred.\nTwice.' },
      { text: "The end." },
    ]);
    expect(book.author).toBe("");
    expect(book.creators).toBe("Stephanie Wei");
    expect(book.publisher).toBe("Room to Read");
    expect(book.statedLicenses).toEqual(["CC BY 4.0"]);
    // "U" (undisclosed) is not a license; the NC picture after the story still counts.
    expect(book.itemLicenses).toEqual(["CC BY 4.0", "CC BY-NC 4.0"]);
    expect(book.skippedPublisher).toBe("StoryWeaver / Pratham Books");
    expect(book.attribution).toBe("Some rights reserved. This book is CC-BY-4.0 licensed.");
  });

  it("refuses an answer that is not a book", () => {
    expect(() => parseGdlBook({ id: "1", title: "x", params: "{not json" })).toThrow(GdlError);
    expect(() => parseGdlBook({ id: "1", title: "x", params: "{}" })).toThrow(/holds no pages/);
    expect(() => parseGdlBook([])).toThrow(GdlError);
  });
});

describe("parseGdlCatalogue", () => {
  it("reads id, page address, license, publisher, content type and reading level of each entry", () => {
    const entries = parseGdlCatalogue(JSON.parse(CATALOGUE));
    expect(entries.map((entry) => entry.id)).toEqual(["14051", "14191", "15517", "235", "15794"]);
    expect(entries[0]).toEqual({
      id: "14051",
      title: "Peter's Peanuts",
      description: "Peter likes peanuts. His Aunty Kila shows Peter how to cook peanuts. Yum! What will Peter do with the peanuts he takes home?",
      slug: "peters-peanuts-2",
      url: "https://content.digitallibrary.io/en/book/peters-peanuts-2/",
      license: "CC BY 4.0",
      publisher: "",
      library: "H5P.InteractiveBookSimple",
      levels: [],
    });
    expect(entries[1].levels).toEqual(["Level 1"]);
    expect(entries.map(gdlCatalogueProblem)).toEqual([
      undefined,
      // Only the book itself shows that Puppy's Story is CC BY-NC.
      undefined,
      "license CC BY-SA 4.0",
      "publisher Book Dash",
      "not a picture book (H5P.InteractiveVideo)",
    ]);
    expect(parseGdlCatalogue({})).toEqual([]);
  });

  it("knows the publishers that are imported from their own sources", () => {
    expect(gdlSkippedPublisher("BookDash")).toBe("Book Dash");
    expect(gdlSkippedPublisher("made possible by Pratham Books' StoryWeaver platform")).toBe("StoryWeaver / Pratham Books");
    expect(gdlSkippedPublisher("African Storybook Initiative")).toBe("African Storybook (Saide)");
    expect(gdlSkippedPublisher("Bilum Books")).toBeUndefined();
  });
});

describe("GdlClient", () => {
  it("fetches the catalogue once and treats GDL's empty answer for an unknown book as not found", async () => {
    const { fetch, calls } = stubFetch(peanutsRoutes({ [`${GDL.apiBase}/h5p/999`]: { body: "" } }));
    const client = new GdlClient({ fetch });
    expect((await client.entry("14051")).slug).toBe("peters-peanuts-2");
    expect((await client.entry("14191")).title).toBe("Puppy's Story");
    expect(calls).toEqual([`${GDL.apiBase}/books/en`]);
    await expect(client.entry("12345")).rejects.toMatchObject({ code: "not-found" });
    await expect(client.book("999")).rejects.toMatchObject({ code: "not-found" });
    await expect(client.book("../1")).rejects.toMatchObject({ code: "invalid-id" });
  });

  it("downloads pictures only from the book's own folder and refuses what is not a picture", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const { fetch, calls } = stubFetch({
      [`${PEANUTS_IMAGES}/p-2.jpg`]: { body: JPEG },
      [`${PEANUTS_IMAGES}/my%20picture.png`]: { body: PNG },
      [`${PEANUTS_IMAGES}/page.html`]: { body: "<html>not a picture</html>" },
      [`${PEANUTS_IMAGES}/logo.svg`]: { body: svg },
      [`${PEANUTS_IMAGES}/huge.jpg`]: { body: JPEG, headers: { "content-length": String(500 * 1024 * 1024) } },
    });
    const client = new GdlClient({ fetch });
    expect((await client.image("14051", "images/p-2.jpg")).contentType).toBe("image/jpeg");
    expect((await client.image("14051", "images/my picture.png")).contentType).toBe("image/png");
    for (const file of ["images/page.html", "images/logo.svg", "images/huge.jpg", "images/missing.jpg"]) {
      await expect(client.image("14051", file)).rejects.toMatchObject({ code: "media" });
    }
    const before = calls.length;
    for (const file of ["images/../../secret.jpg", "https://evil.example/a.jpg", "content/a.jpg", "images/a/b.jpg", "images/a.jpg?x=1"]) {
      await expect(client.image("14051", file)).rejects.toMatchObject({ code: "media" });
    }
    expect(calls).toHaveLength(before);
  });
});

describe("importGdlBook", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  it("creates an English draft with images, descriptions and the credits of the book's own pages", async () => {
    const { fetch, calls } = stubFetch(peanutsRoutes());
    const result = await importGdlBook({ id: "14051", ownerId: "system", repo: data.repo, media: data.media, client: new GdlClient({ fetch }) });
    expect(result.status).toBe("created");
    expect(result.warnings).toEqual([]);
    const book = result.book;
    expect(book).toMatchObject({
      id: "gdl-14051",
      slug: "gdl-peters-peanuts-2",
      title: "Peter's Peanuts",
      status: "draft",
      origin: "import",
      ownerId: "system",
      language: "en",
      originalLanguage: "en",
      license: "CC BY 4.0",
      source: "https://content.digitallibrary.io/en/book/peters-peanuts-2/",
      author: "Tandi Jackson",
      illustrator: "Michael Mape",
      coverImage: "books/gdl-14051/cover.png",
    });
    expect(book.credits).toEqual({
      publisher: "Bilum Books",
      publisherUrl: "http://bilumbooks.com/",
      attributionLine: expect.stringContaining("© Bilum Books. Released under CC BY 4.0."),
      originalTitle: "Peter's Peanuts",
    });
    expect(book.summary).toContain("Peter likes peanuts.");
    expect(book.pages).toHaveLength(11);
    expect(book.pages[0]).toEqual({
      index: 0,
      text: 'In the school holidays Peter stayed with his Uncle Joe. Peter helped Uncle Joe in his garden. He helped his uncle dig up some peanuts. "Yum!" said Peter. "I like peanuts!"',
      originalText:
        'In the school holidays Peter stayed with his Uncle Joe. Peter helped Uncle Joe in his garden. He helped his uncle dig up some peanuts. "Yum!" said Peter. "I like peanuts!"',
      imageAlt: "A man named Uncle Joe pulls peanut plants from the grounds. Peter stands by and helps by holding plants.",
      // The file is named .jpg on GDL; the stored name follows what the bytes are.
      image: "books/gdl-14051/page-01.jpg",
    });
    expect(await data.media.list("books/gdl-14051")).toHaveLength(12);
    // The catalogue, the book, 11 pages and the cover: no logo or back-matter picture is fetched.
    expect(calls).toHaveLength(14);
    expect(calls.slice(2).every((url) => url.startsWith(`${PEANUTS_IMAGES}/`))).toBe(true);

    expect(await findGdlBook(data.repo, "14051")).toEqual(book);
    expect(gdlBookId("14051")).toBe(book.id);
    expect(publishProblems(book).map((problem) => problem.code)).toContain("language");
  });

  it("is idempotent: a second import changes nothing, force replaces the copy", async () => {
    const { fetch, calls } = stubFetch(peanutsRoutes());
    const options = { id: "14051", ownerId: "system", repo: data.repo, media: data.media, client: new GdlClient({ fetch }) };
    const first = await importGdlBook(options);
    await data.repo.updateBook(first.book.id, { title: "הבוטנים של פיטר", language: "he" });
    const requests = calls.length;

    const second = await importGdlBook(options);
    expect(second.status).toBe("skipped");
    expect(second.book.title).toBe("הבוטנים של פיטר");
    expect(calls).toHaveLength(requests);

    const forced = await importGdlBook({ ...options, ownerId: "u_other", force: true });
    expect(forced.status).toBe("replaced");
    expect(forced.book).toMatchObject({ title: "Peter's Peanuts", language: "en", ownerId: "u_other" });
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(1);

    await data.repo.updateBook(first.book.id, { status: "published", language: "he" });
    await expect(importGdlBook({ ...options, force: true })).rejects.toBeInstanceOf(GdlError);
  });

  it("refuses every license but CC BY 4.0 and CC0, before any picture is downloaded", async () => {
    const stated = (license: string) => PEANUTS.replaceAll("Released under CC BY 4.0", license).replaceAll("licenses/by/4.0/", "");
    const { fetch, calls } = stubFetch(
      peanutsRoutes({
        [`${GDL.apiBase}/h5p/15517`]: { body: PEANUTS },
        [`${GDL.apiBase}/h5p/235`]: { body: stated("Released under CC BY-SA 4.0") },
      }),
    );
    const base = { ownerId: "system", repo: data.repo, media: data.media, client: new GdlClient({ fetch }) };
    // The catalogue says CC BY 4.0, the book says CC BY-NC 4.0.
    await expect(importGdlBook({ ...base, id: "14191" })).rejects.toMatchObject({ code: "license", message: expect.stringContaining("CC BY-NC 4.0") });
    // The catalogue says CC BY-SA 4.0: the book is not even fetched.
    await expect(importGdlBook({ ...base, id: "15517" })).rejects.toMatchObject({ code: "license" });
    await expect(importGdlBook({ ...base, id: "235", includeSkippedPublishers: true })).rejects.toMatchObject({ code: "license" });
    expect(calls.filter((url) => url.startsWith(GDL.mediaBase))).toEqual([]);
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);

    // A book that states no license, an older version, or an item under another license.
    for (const body of [
      stated(""),
      stated("Released under CC BY 3.0"),
      stated("All rights reserved"),
      PEANUTS.replace('\\"license\\":\\"CC BY\\"', '\\"license\\":\\"CC BY-ND\\"'),
    ]) {
      const client = new GdlClient({ fetch: stubFetch(peanutsRoutes({ [`${GDL.apiBase}/h5p/14051`]: { body } })).fetch });
      await expect(importGdlBook({ ...base, client, id: "14051" })).rejects.toMatchObject({ code: "license" });
    }
    expect(await data.media.list("books/gdl-14051")).toEqual([]);
  });

  it("skips the publishers that are imported from their own sources, unless asked", async () => {
    const { fetch } = stubFetch(peanutsRoutes({ [`${GDL.apiBase}/h5p/235`]: { body: PEANUTS } }));
    const base = { ownerId: "system", repo: data.repo, media: data.media, client: new GdlClient({ fetch }) };
    await expect(importGdlBook({ ...base, id: "235" })).rejects.toMatchObject({ code: "publisher" });
    // The credits page names the publisher even when the catalogue does not.
    const viaStoryWeaver = PEANUTS.replace("Brought to you by", "This book was made possible by Pratham Books' StoryWeaver platform.");
    const client = new GdlClient({ fetch: stubFetch(peanutsRoutes({ [`${GDL.apiBase}/h5p/14051`]: { body: viaStoryWeaver } })).fetch });
    await expect(importGdlBook({ ...base, client, id: "14051" })).rejects.toMatchObject({ code: "publisher" });
    expect((await importGdlBook({ ...base, client, id: "14051", includeSkippedPublishers: true })).status).toBe("created");
  });

  it("stores nothing when an illustration is missing or the pages have no separate text", async () => {
    const routes = peanutsRoutes();
    delete routes[`${PEANUTS_IMAGES}/p-9.jpg`];
    const base = { id: "14051", ownerId: "system", repo: data.repo, media: data.media };
    await expect(importGdlBook({ ...base, client: new GdlClient({ fetch: stubFetch(routes).fetch }) })).rejects.toMatchObject({ code: "media" });
    expect(await findGdlBook(data.repo, "14051")).toBeNull();
    expect(await data.media.list("books/gdl-14051")).toEqual([]);

    // The story text gone from every page: pictures only, as in a book whose words are painted into them.
    const parsed = JSON.parse(PEANUTS) as { params: string };
    const params = JSON.parse(parsed.params) as { chapters: { params: { content: { content: { library: string } }[] } }[] };
    for (const chapter of params.chapters.slice(2, 13)) chapter.params.content = chapter.params.content.filter((item) => item.content.library.startsWith("H5P.Image"));
    const body = JSON.stringify({ ...parsed, params: JSON.stringify(params) });
    const { fetch, calls } = stubFetch(peanutsRoutes({ [`${GDL.apiBase}/h5p/14051`]: { body } }));
    await expect(importGdlBook({ ...base, client: new GdlClient({ fetch }) })).rejects.toMatchObject({ code: "no-text" });
    expect(calls).toHaveLength(2);
  });

  it("rejects unknown books and unsafe ids without a request for the book", async () => {
    const { fetch, calls } = stubFetch(peanutsRoutes());
    const base = { ownerId: "system", repo: data.repo, media: data.media, client: new GdlClient({ fetch }) };
    await expect(importGdlBook({ ...base, id: "../etc" })).rejects.toMatchObject({ code: "invalid-id" });
    await expect(importGdlBook({ ...base, id: "0" })).rejects.toMatchObject({ code: "invalid-id" });
    await expect(importGdlBook({ ...base, id: "424242" })).rejects.toMatchObject({ code: "not-found" });
    await expect(importGdlBook({ ...base, id: "15794" })).rejects.toMatchObject({ code: "invalid-book" });
    expect(calls).toEqual([`${GDL.apiBase}/books/en`]);
    expect(await findGdlBook(data.repo, "../etc")).toBeNull();
  });
});
