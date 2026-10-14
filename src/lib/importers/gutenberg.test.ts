import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishProblems } from "@/lib/studio/shared";
import { createTempData, type TempData } from "@/test/temp-data";
import type { FetchLike } from "./bookdash";
import {
  GUTENBERG,
  GUTENBERG_BOOKS,
  GutenbergClient,
  GutenbergError,
  findGutenbergBook,
  gutenbergBookId,
  gutenbergCuratedBook,
  gutenbergDisplayName,
  gutenbergLicenseProblem,
  gutenbergSlug,
  gutenbergTitleCase,
  importGutenbergBook,
  importGutenbergCollection,
  parseGutenbergCollection,
  parseGutenbergHtml,
  parseGutenbergRdf,
  type GutenbergRecord,
} from "./gutenberg";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
/**
 * The real files of ebook 14838, "The Tale of Peter Rabbit": pg14838.rdf without its list of download
 * formats, and pg14838-images.html without its style sheets and with only the beginning of the license.
 */
const RDF = readFileSync(path.join(FIXTURES, "gutenberg-14838.rdf"), "utf8");
const HTML = readFileSync(path.join(FIXTURES, "gutenberg-14838.html"), "utf8");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000");

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

const BASE = `${GUTENBERG.cacheBase}/14838`;
/** The 26 story pictures of the fixture, in order: images/peter08.jpg ... images/peter58.jpg. */
const STORY_IMAGES = [...HTML.matchAll(/src="(images\/peter\d+\.jpg)"/g)].map((match) => match[1]).filter((file) => file !== "images/peter04.jpg");

function peterRoutes(extra: Record<string, StubResponse> = {}): Record<string, StubResponse> {
  const routes: Record<string, StubResponse> = {
    [`${BASE}/pg14838.rdf`]: { body: RDF },
    [`${BASE}/pg14838-images.html`]: { body: HTML },
    [`${BASE}/images/peter04.jpg`]: { body: JPEG },
    [`${BASE}/images/peter02.gif`]: { body: GIF },
    [`${BASE}/images/cover.jpg`]: { body: JPEG },
  };
  for (const file of STORY_IMAGES) routes[`${BASE}/${file}`] = { body: JPEG };
  return { ...routes, ...extra };
}

function client(routes: Record<string, StubResponse>): { client: GutenbergClient; calls: string[] } {
  const { fetch, calls } = stubFetch(routes);
  return { client: new GutenbergClient({ fetch, pauseMs: 0 }), calls };
}

describe("parseGutenbergRdf", () => {
  it("reads title, rights, language and the creators with their years", () => {
    expect(parseGutenbergRdf(RDF)).toEqual({
      title: "The Tale of Peter Rabbit",
      subtitle: "",
      rights: "Public domain in the USA.",
      languages: ["en"],
      creators: [{ name: "Beatrix Potter", role: "author", born: 1866, died: 1943 }],
    });
  });

  it("reads illustrators and translators, a subtitle, and a creator without dates", () => {
    const agent = (tag: string, name: string, dates = "") => `<${tag}><pgterms:agent rdf:about="2009/agents/1"><pgterms:name>${name}</pgterms:name>${dates}</pgterms:agent></${tag}>`;
    const died = (year: number) => `<pgterms:deathdate rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">${year}</pgterms:deathdate>`;
    const rdf = RDF.replace("<dcterms:title>The Tale of Peter Rabbit</dcterms:title>", "<dcterms:title>The cock, the mouse &amp; the hen : $b an old tale\nretold</dcterms:title>").replace(
      /<dcterms:creator>[\s\S]*?<\/dcterms:creator>/,
      agent("dcterms:creator", "Anonymous") + agent("marcrel:ill", "Brooke, L. Leslie (Leonard Leslie)", died(1940)) + agent("marcrel:trl", "Forbes, Nevill", died(1929)) + agent("marcrel:ctb", "Ross, M. T."),
    );
    expect(parseGutenbergRdf(rdf)).toMatchObject({
      title: "The cock, the mouse & the hen",
      subtitle: "an old tale retold",
      creators: [
        { name: "Anonymous", role: "author" },
        { name: "L. Leslie Brooke", role: "illustrator", died: 1940 },
        { name: "Nevill Forbes", role: "translator", died: 1929 },
        { name: "M. T. Ross", role: "ctb" },
      ],
    });
    expect(gutenbergDisplayName("Potter, Beatrix")).toBe("Beatrix Potter");
    expect(gutenbergDisplayName("Tennyson, Hallam Tennyson, Baron")).toBe("Tennyson, Hallam Tennyson, Baron");
    expect(() => parseGutenbergRdf("<html>You have been blocked</html>")).toThrow(GutenbergError);
  });
});

describe("gutenbergLicenseProblem", () => {
  const record = (creators: GutenbergRecord["creators"], rights: string = GUTENBERG.rights): GutenbergRecord => ({ title: "x", subtitle: "", rights, languages: ["en"], creators });
  const potter = { name: "Beatrix Potter", role: "author", died: 1943 };

  it("accepts a book only when it is public domain in the USA and every creator died by 1955", () => {
    expect(gutenbergLicenseProblem(parseGutenbergRdf(RDF))).toBeUndefined();
    expect(gutenbergLicenseProblem(record([potter, { name: "Robert Gaston Herbert", role: "illustrator", died: 1955 }]))).toBeUndefined();
    // Thornton Burgess died in 1965; an illustrator counts as much as the author.
    expect(gutenbergLicenseProblem(record([{ name: "Thornton W. Burgess", role: "author", died: 1965 }]))).toMatch(/died in 1965/);
    expect(gutenbergLicenseProblem(record([potter, { name: "Virginia Albert", role: "illustrator", died: 1967 }]))).toMatch(/Virginia Albert died in 1967/);
    expect(gutenbergLicenseProblem(record([potter, { name: "Somebody", role: "translator", died: 1956 }]))).toMatch(/1956/);
  });

  it("refuses other rights statements, unknown death years and books without creators", () => {
    expect(gutenbergLicenseProblem(record([potter], "Copyrighted. Read the copyright notice inside this book for details."))).toMatch(/Copyrighted/);
    expect(gutenbergLicenseProblem(record([potter], ""))).toMatch(/nothing/);
    expect(gutenbergLicenseProblem(record([potter, { name: "M. T. Ross", role: "illustrator" }]))).toMatch(/death year of M\. T\. Ross is unknown/);
    expect(gutenbergLicenseProblem(record([]))).toMatch(/no creator/);
    // A creator a person read off the title page is checked like the rdf's.
    expect(gutenbergLicenseProblem(record([potter]), { creators: [{ name: "Late Artist", died: 1970 }] })).toMatch(/Late Artist died in 1970/);
    expect(gutenbergLicenseProblem(record([]), { creators: [{ name: "Early Artist", died: 1901 }] })).toBeUndefined();
  });

  it("lets an anonymous work through only with a checked publication year before 1900", () => {
    const anonymous = record([{ name: "Anonymous", role: "author" }, { name: "Kate Greenaway", role: "illustrator", died: 1901 }]);
    expect(gutenbergLicenseProblem(anonymous)).toMatch(/Anonymous/);
    expect(gutenbergLicenseProblem(anonymous, { anonymousPublished: 1917 })).toMatch(/1917/);
    expect(gutenbergLicenseProblem(anonymous, { anonymousPublished: 1885 })).toBeUndefined();
    // The exception is for anonymous works, not for a named creator whose dates are missing.
    expect(gutenbergLicenseProblem(record([{ name: "M. T. Ross", role: "illustrator" }]), { anonymousPublished: 1885 })).toMatch(/unknown/);
  });

  it("holds for every book of the curated list that names extra creators", () => {
    expect(GUTENBERG_BOOKS.length).toBeGreaterThan(20);
    expect(new Set(GUTENBERG_BOOKS.map((book) => book.id)).size).toBe(GUTENBERG_BOOKS.length);
    for (const book of GUTENBERG_BOOKS) {
      expect(book.id).toMatch(/^[1-9]\d*$/);
      for (const creator of book.creators ?? []) expect(creator.died).toBeLessThanOrEqual(GUTENBERG.latestDeathYear);
      if (book.anonymousPublished !== undefined) expect(book.anonymousPublished).toBeLessThan(1900);
    }
    expect(gutenbergCuratedBook("14838")).toMatchObject({ title: "The Tale of Peter Rabbit", pairing: "after" });
    expect(gutenbergCuratedBook("1")).toBeUndefined();
  });
});

describe("parseGutenbergHtml", () => {
  it("cuts the real Peter Rabbit into 26 pages, a picture with the text after it, without front matter or boilerplate", () => {
    const book = parseGutenbergHtml(HTML, gutenbergCuratedBook("14838"));
    expect(book.title).toBe("The Tale of Peter Rabbit");
    expect(book.warnings).toEqual([]);
    expect(book.coverImagePath).toBe("images/peter04.jpg");
    expect(book.pages).toHaveLength(26);
    expect(book.pages.map((page) => page.imagePath)).toEqual(STORY_IMAGES);
    // The text before the first picture opens the first page; the verse lines of the names are kept.
    expect(book.pages[0]).toEqual({
      imagePath: "images/peter08.jpg",
      text:
        "Once upon a time there were four little Rabbits, and their names were—\nFlopsy,\nMopsy,\nCotton-tail,\nand Peter.\n" +
        "They lived with their Mother in a sand-bank, underneath the root of a very big fir-tree.",
    });
    expect(book.pages[2]).toEqual({ imagePath: "images/peter12.jpg", text: "'Now run along, and don't get into mischief. I am going out.'" });
    expect(book.pages[10].text).toBe(
      "Peter was most dreadfully frightened; he rushed all over the garden, for he had forgotten the way back to the gate.\n" +
        "He lost one of his shoes among the cabbages, and the other shoe amongst the potatoes.",
    );
    expect(book.pages[25]).toEqual({ imagePath: "images/peter58.jpg", text: "But Flopsy, Mopsy, and Cotton-tail had bread and milk and blackberries for supper." });
    for (const page of book.pages) {
      expect(page.text).not.toMatch(/[<>]|&[a-z#0-9]+;|\[Illustration|Gutenberg|THE END|FREDERICK WARNE|BEATRIX POTTER|eBook|License/);
      expect(page.imageAlt).toBeUndefined();
    }
  });

  it("finds the story by itself when nobody left hints, and takes the book's own cover file", () => {
    const book = parseGutenbergHtml(HTML);
    expect(book.pages).toHaveLength(26);
    expect(book.pages[0].text).toMatch(/^Once upon a time there were four little Rabbits/);
    expect(book.coverImagePath).toBe("images/cover.jpg");
  });

  const page = (body: string) => `<html><head><meta name="dc.title" content="Tom &amp; Tib"></head><body><header id="pg-header"><h2>The Project Gutenberg eBook of Tom</h2></header>${body}<footer id="pg-footer">license</footer></body></html>`;
  const figure = (file: string, alt = "[Illustration]") => `<div class="fig"><img alt="${alt}" src="images/${file}"></div>`;

  it("pairs text with the picture after it, or shares it between two pictures of a spread", () => {
    const html = page(
      `<h1>TOM</h1><p>Copyright 1906 by Frederick Warne &amp; Co.</p>` +
        `${figure("a.jpg")}<p>This is Tom, a cat who liked to sit.</p><p>This is Tib, who liked it too.</p>${figure("b.jpg")}` +
        `${figure("c.jpg", "They sat all day")}<p>They sat all day,<br>on a mat.</p><p>Then they went home, quite pleased.</p>${figure("d.jpg")}<p>THE END</p><p>Other books by the same author.</p>`,
    );
    const before = parseGutenbergHtml(html, { pairing: "before", start: "This is Tom" });
    // The picture before the place where the story begins is front matter: it becomes the cover.
    expect(before.coverImagePath).toBe("images/a.jpg");
    expect(before.pages).toEqual([
      { imagePath: "images/b.jpg", text: "This is Tom, a cat who liked to sit.\nThis is Tib, who liked it too." },
      { imagePath: "images/c.jpg", imageAlt: "They sat all day", text: "" },
      { imagePath: "images/d.jpg", text: "They sat all day,\non a mat.\nThen they went home, quite pleased." },
    ]);
    expect(before.warnings).toEqual(["page 2 has a picture but no text"]);

    const spread = parseGutenbergHtml(html, { pairing: "spread", start: "images/a.jpg", joinLines: true });
    expect(spread.pages).toEqual([
      { imagePath: "images/a.jpg", text: "This is Tom, a cat who liked to sit." },
      { imagePath: "images/b.jpg", text: "This is Tib, who liked it too." },
      // An alt text that repeats the words of the page is not a description.
      { imagePath: "images/c.jpg", text: "They sat all day, on a mat." },
      { imagePath: "images/d.jpg", text: "Then they went home, quite pleased." },
    ]);
    expect(spread.warnings).toEqual([]);
    // A person can say how many paragraphs stay with the picture before.
    const cut = parseGutenbergHtml(html, { pairing: "spread", start: "images/a.jpg", spreadCuts: { "images/b.jpg": 2 } });
    expect(cut.pages.slice(0, 2).map((p) => p.text)).toEqual(["This is Tom, a cat who liked to sit.\nThis is Tib, who liked it too.", ""]);
  });

  it("uses the full picture behind a thumbnail, captions as descriptions, and drops page numbers, ornaments and unsafe addresses", () => {
    const html = page(
      `<p class="figcenter"><a href="images/08.jpg"><img alt="On the bank" src="images/08-tb.jpg" title="On the bank"></a></p>` +
        `<p><span class="pagenum">[Pg 7]</span><img alt="O" src="images/initial-o.png">ne morning a little rabbit sat down &mdash; [Illustration: rabbit] and&nbsp;listened. {12}</p>` +
        `<div class="figcenter"><img alt="" src="images/09.jpg"><p class="caption">The gig goes by</p></div><p>A gig was coming along the road.</p>` +
        `<img alt="" src="https://evil.example/x.jpg"><img alt="" src="../../etc/x.jpg"><img alt="" src="images/tail.png"><p>Transcriber's note: spelling was kept.</p><p>It was driven by Mr. McGregor.</p>`,
    );
    const book = parseGutenbergHtml(html, { start: "images/08.jpg", skip: ["images/tail.png"] });
    expect(book.pages).toEqual([
      { imagePath: "images/08.jpg", imageAlt: "On the bank", text: "One morning a little rabbit sat down — and listened." },
      { imagePath: "images/09.jpg", imageAlt: "The gig goes by", text: "A gig was coming along the road.\nIt was driven by Mr. McGregor." },
    ]);
    expect(book.warnings).toHaveLength(2);
    expect(book.warnings[0]).toMatch(/not inside the book's folder/);
    expect(parseGutenbergHtml(html, { start: "images/08.jpg", skipPattern: "^images/(tail|09)" }).pages).toHaveLength(1);
  });

  it("moves a text that is too long for one page to pages without a picture, and says so", () => {
    const sentence = "The tailor sat and sewed all through the long cold night. ";
    const html = page(`${figure("a.jpg")}<p>${sentence.repeat(40)}</p><p>${sentence.repeat(40)}</p>${figure("b.jpg")}<p>He slept.</p>`);
    const book = parseGutenbergHtml(html, { start: "images/a.jpg" });
    expect(book.pages.map((p) => p.imagePath)).toEqual(["images/a.jpg", undefined, "images/b.jpg"]);
    for (const p of book.pages) expect(p.text.length).toBeLessThanOrEqual(3000);
    expect(book.pages[0].text + book.pages[1].text).toHaveLength(sentence.length * 80 - 2);
    expect(book.warnings[0]).toMatch(/too long for one page/);
  });

  it("refuses a page that is not a book or whose hints point at nothing", () => {
    expect(() => parseGutenbergHtml(page(""))).toThrow(/holds no book/);
    expect(() => parseGutenbergHtml(page("<h1>TITLE</h1><p>LONDON</p>"))).toThrow(/reads like a story/);
    expect(() => parseGutenbergHtml(HTML, { start: "images/missing.jpg" })).toThrow(/beginning of the story was not found/);
    expect(() => parseGutenbergHtml(HTML, { end: "No such paragraph" })).toThrow(/end of the story was not found/);
  });
});

describe("GutenbergClient", () => {
  it("asks only for the files of the ebook, and stops at a refusal of the server", async () => {
    const { client: reader, calls } = client(peterRoutes());
    expect((await reader.record("14838")).title).toBe("The Tale of Peter Rabbit");
    expect(await reader.html("14838")).toContain("Once upon a time");
    expect(calls).toEqual([`${BASE}/pg14838.rdf`, `${BASE}/pg14838-images.html`]);
    await expect(reader.record("99")).rejects.toMatchObject({ code: "not-found" });
    await expect(reader.record("../1")).rejects.toMatchObject({ code: "invalid-id" });
    await expect(reader.html("0")).rejects.toMatchObject({ code: "invalid-id" });

    for (const refusal of [{ status: 403 }, { status: 429 }, { body: "<html><body><h1>Sorry</h1><p>You have been blocked.</p></body></html>" }] as StubResponse[]) {
      const blocked = client({ [`${BASE}/pg14838.rdf`]: refusal, [`${BASE}/pg14838-images.html`]: refusal, [`${BASE}/images/peter08.jpg`]: { status: 403 } }).client;
      await expect(blocked.record("14838")).rejects.toMatchObject({ code: "blocked" });
      await expect(blocked.html("14838")).rejects.toMatchObject({ code: "blocked" });
      await expect(blocked.image("14838", "images/peter08.jpg")).rejects.toMatchObject({ code: "blocked" });
    }
    await expect(client({ [`${BASE}/pg14838.rdf`]: { status: 503 } }).client.record("14838")).rejects.toMatchObject({ code: "network" });
  });

  it("downloads pictures only from the book's own folder and refuses what is not a picture", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const { client: reader, calls } = client({
      [`${BASE}/images/peter08.jpg`]: { body: JPEG },
      [`${BASE}/images/line_main/pg11.png`]: { body: GIF },
      [`${BASE}/images/page.jpg`]: { body: "<html>not a picture</html>" },
      [`${BASE}/images/logo.png`]: { body: svg },
      [`${BASE}/images/huge.jpg`]: { body: JPEG, headers: { "content-length": String(500 * 1024 * 1024) } },
    });
    expect((await reader.image("14838", "images/peter08.jpg")).contentType).toBe("image/jpeg");
    // The stored type follows the bytes, not the name.
    expect((await reader.image("14838", "images/line_main/pg11.png")).contentType).toBe("image/gif");
    for (const file of ["images/page.jpg", "images/logo.png", "images/huge.jpg", "images/missing.jpg"]) {
      await expect(reader.image("14838", file)).rejects.toMatchObject({ code: "media" });
    }
    const before = calls.length;
    for (const file of ["images/../../14839/images/a.jpg", "https://evil.example/a.jpg", "/etc/a.jpg", "a/b/c/d.jpg", "images/a.jpg?x=1", "images/a.svg", "pg14838.rdf"]) {
      await expect(reader.image("14838", file)).rejects.toMatchObject({ code: "media" });
    }
    expect(calls).toHaveLength(before);
    expect(calls.every((url) => url.startsWith(`${GUTENBERG.cacheBase}/14838/`))).toBe(true);
  });
});

describe("importGutenbergBook", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  it("creates an English draft with one picture per page and plain credits", async () => {
    const { client: reader, calls } = client(peterRoutes());
    const result = await importGutenbergBook({ id: "14838", ownerId: "system", repo: data.repo, media: data.media, client: reader });
    expect(result.status).toBe("created");
    expect(result.warnings).toEqual([]);
    const book = result.book;
    expect(book).toMatchObject({
      id: "gutenberg-14838",
      slug: "gutenberg-the-tale-of-peter-rabbit",
      title: "The Tale of Peter Rabbit",
      summary: "",
      status: "draft",
      origin: "import",
      ownerId: "system",
      language: "en",
      originalLanguage: "en",
      ageGroup: "3-5",
      license: "Public domain",
      source: "https://www.gutenberg.org/ebooks/14838",
      author: "Beatrix Potter",
      illustrator: "Beatrix Potter",
      coverImage: "books/gutenberg-14838/cover.jpg",
    });
    expect(book.credits).toEqual({
      publisher: "Frederick Warne & Co.",
      attributionLine: "Digitized text and illustrations from Project Gutenberg ebook #14838 (public domain).",
      originalTitle: "The Tale of Peter Rabbit",
    });
    expect(book.pages).toHaveLength(26);
    expect(book.pages[3]).toEqual({
      index: 3,
      text: "Then old Mrs. Rabbit took a basket and her umbrella, and went through the wood to the baker's. She bought a loaf of brown bread and five currant buns.",
      originalText: "Then old Mrs. Rabbit took a basket and her umbrella, and went through the wood to the baker's. She bought a loaf of brown bread and five currant buns.",
      image: "books/gutenberg-14838/page-04.jpg",
    });
    expect(await data.media.list("books/gutenberg-14838")).toHaveLength(27);
    // The rdf, the HTML, 26 pages and the frontispiece: neither the title vignette nor anything else is fetched.
    expect(calls).toHaveLength(29);
    expect(calls.slice(0, 2)).toEqual([`${BASE}/pg14838.rdf`, `${BASE}/pg14838-images.html`]);
    expect(calls.every((url) => url.startsWith(`${BASE}/`))).toBe(true);
    expect(book.pages.map((page) => page.text).join("\n")).not.toMatch(/Gutenberg/i);

    expect(await findGutenbergBook(data.repo, "14838")).toEqual(book);
    expect(gutenbergBookId("14838")).toBe(book.id);
    expect(publishProblems(book).map((problem) => problem.code)).toContain("language");
  });

  it("is idempotent: a second import changes nothing, force replaces the copy", async () => {
    const { client: reader, calls } = client(peterRoutes());
    const options = { id: "14838", ownerId: "system", repo: data.repo, media: data.media, client: reader };
    const first = await importGutenbergBook(options);
    await data.repo.updateBook(first.book.id, { title: "פיטר הארנב", language: "he" });
    const requests = calls.length;

    const second = await importGutenbergBook(options);
    expect(second.status).toBe("skipped");
    expect(second.book.title).toBe("פיטר הארנב");
    expect(calls).toHaveLength(requests);

    const forced = await importGutenbergBook({ ...options, ownerId: "u_other", force: true });
    expect(forced.status).toBe("replaced");
    expect(forced.book).toMatchObject({ title: "The Tale of Peter Rabbit", language: "en", ownerId: "u_other" });
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(1);

    await data.repo.updateBook(first.book.id, { status: "published", language: "he" });
    await expect(importGutenbergBook({ ...options, force: true })).rejects.toBeInstanceOf(GutenbergError);
  });

  it("refuses a book that is not free in Israel before its text or any picture is fetched", async () => {
    const base = { id: "14838", ownerId: "system", repo: data.repo, media: data.media };
    for (const rdf of [
      // Died in 1965, like Thornton Burgess.
      RDF.replace(">1943</pgterms:deathdate>", ">1965</pgterms:deathdate>"),
      // No death year at all.
      RDF.replace(/<pgterms:deathdate[^>]*>1943<\/pgterms:deathdate>/, ""),
      RDF.replace("Public domain in the USA.", "Copyrighted. Read the copyright notice inside this book for details."),
      RDF.replace(/<dcterms:creator>[\s\S]*?<\/dcterms:creator>/, ""),
      RDF.replace("<pgterms:name>Potter, Beatrix</pgterms:name>", "<pgterms:name>Anonymous</pgterms:name>").replace(/<pgterms:(birth|death)date[^>]*>\d+<\/pgterms:\1date>/g, ""),
    ]) {
      const { client: reader, calls } = client(peterRoutes({ [`${BASE}/pg14838.rdf`]: { body: rdf } }));
      await expect(importGutenbergBook({ ...base, client: reader })).rejects.toMatchObject({ code: "license" });
      expect(calls).toEqual([`${BASE}/pg14838.rdf`]);
    }
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);
    expect(await data.media.list("books/gutenberg-14838")).toEqual([]);

    // A book in another language is not an English draft.
    const french = client(peterRoutes({ [`${BASE}/pg14838.rdf`]: { body: RDF.replace(">en</rdf:value>", ">fr</rdf:value>") } })).client;
    await expect(importGutenbergBook({ ...base, client: french })).rejects.toMatchObject({ code: "invalid-book" });
  });

  it("refuses what is not a picture book of text next to pictures", async () => {
    const base = { id: "14838", ownerId: "system", repo: data.repo, media: data.media };
    const withHtml = (html: string) => client(peterRoutes({ [`${BASE}/pg14838-images.html`]: { body: html } }));
    const story = HTML.slice(HTML.indexOf("<p>Once upon a time"), HTML.indexOf('<div class="h3">THE END</div>'));
    const around = (body: string) => HTML.replace(story, body);

    // Five pictures only: prose with a few plates.
    const few = withHtml(around(story.split('<div class="fig"').slice(0, 6).join('<div class="fig"')));
    await expect(importGutenbergBook({ ...base, client: few.client })).rejects.toMatchObject({ code: "invalid-book", message: expect.stringContaining("5 illustrated pages") });
    expect(few.calls).toHaveLength(2);

    // The pictures without their text, as in a book whose words are lettered inside them.
    const textless = withHtml(around(`<p>Once upon a time there were four little Rabbits, and they had names.</p>${story.replace(/<p>[\s\S]*?<\/p>/g, "")}`));
    await expect(importGutenbergBook({ ...base, client: textless.client })).rejects.toMatchObject({ code: "no-text" });

    // A long tale between the pictures: most pages have no picture.
    const prose = withHtml(around(story.replace("<p>They lived", `${"<p>They walked on and on through the wood, and nothing happened at all that day.</p>".repeat(1500)}<p>They lived`)));
    await expect(importGutenbergBook({ ...base, client: prose.client })).rejects.toMatchObject({ code: "invalid-book", message: expect.stringContaining("have no picture") });

    // More pages than a book may have.
    const many = withHtml(around(story + story + story));
    await expect(importGutenbergBook({ ...base, client: many.client })).rejects.toMatchObject({ code: "invalid-book", message: expect.stringContaining("too many pages") });
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);
  });

  it("stores nothing when an illustration is missing or the server shuts the door half-way", async () => {
    const base = { id: "14838", ownerId: "system", repo: data.repo, media: data.media };
    const missing = peterRoutes();
    delete missing[`${BASE}/images/peter40.jpg`];
    await expect(importGutenbergBook({ ...base, client: client(missing).client })).rejects.toMatchObject({ code: "media" });

    const blocked = client(peterRoutes({ [`${BASE}/images/peter20.jpg`]: { status: 403 } }));
    await expect(importGutenbergBook({ ...base, client: blocked.client })).rejects.toMatchObject({ code: "blocked" });
    // The run ends at the refusal: no picture after it is asked for.
    expect(blocked.calls[blocked.calls.length - 1]).toBe(`${BASE}/images/peter20.jpg`);

    expect(await findGutenbergBook(data.repo, "14838")).toBeNull();
    expect(await data.media.list("books/gutenberg-14838")).toEqual([]);

    // Only the cover may be missing: the first illustration stands in for it.
    const noCover = peterRoutes();
    delete noCover[`${BASE}/images/peter04.jpg`];
    const result = await importGutenbergBook({ ...base, client: client(noCover).client });
    expect(result.book.coverImage).toBe("books/gutenberg-14838/page-01.jpg");
    expect(result.warnings).toEqual([expect.stringContaining("the cover could not be downloaded")]);
  });

  it("warns about an ebook nobody looked at, and rejects unsafe numbers without a request", async () => {
    const routes: Record<string, StubResponse> = {};
    for (const [url, response] of Object.entries(peterRoutes())) routes[url.replaceAll("14838", "424242")] = response;
    const { client: reader, calls } = client(routes);
    const base = { ownerId: "system", repo: data.repo, media: data.media, client: reader };
    const result = await importGutenbergBook({ ...base, id: "424242" });
    expect(result.book).toMatchObject({ id: "gutenberg-424242", author: "Beatrix Potter", illustrator: "", coverImage: "books/gutenberg-424242/cover.jpg" });
    // The original publisher is recorded by hand only: an ebook off the list has none.
    expect(result.book.credits?.publisher).toBeUndefined();
    expect(result.warnings).toEqual([expect.stringContaining("not on the curated list"), "the rdf names no illustrator"]);

    const requests = calls.length;
    for (const id of ["../etc", "0", "12a", "", "123456789"]) {
      await expect(importGutenbergBook({ ...base, id })).rejects.toMatchObject({ code: "invalid-id" });
    }
    expect(calls).toHaveLength(requests);
    expect(await findGutenbergBook(data.repo, "../etc")).toBeNull();
    expect(gutenbergSlug("7", "Johnny Crow's Garden")).toBe("gutenberg-johnny-crows-garden");
    expect(gutenbergSlug("7", "מעשה")).toBe("gutenberg-7");
  });
});

/** A small collection in the shape of ebook 19994, The Aesop for Children: one <h2> per fable. */
const COLLECTION_HTML = `<html><body>
<h2>A LIST OF THE FABLES</h2><p>The Fox and the Grapes .... 1</p>
<h2>THE FOX AND THE GRAPES</h2>
<div class="figright"><img alt="THE FOX AND THE GRAPES" src="images/i011_th.jpg"></div>
<p>A Fox one day spied a beautiful bunch of ripe grapes hanging from a vine.</p>
<p>Again and again he tried, but in vain.</p>
<p class="center"><i>There are many who pretend to despise that which is beyond their reach.</i></p>
<h2>THE BUNDLE OF STICKS</h2><p>A father had a family of sons who were always quarreling.</p>
<h2>MERCURY AND THE WOODMAN</h2><img alt="" src="images/i060_th.jpg"><p>A poor Woodman was cutting down a tree.</p>
<h2>THE TOWN MOUSE AND THE COUNTRY MOUSE</h2>
<img alt="THE TOWN MOUSE AND THE COUNTRY MOUSE" src="images/i009_th.jpg">
<p>${"A Town Mouse once visited a relative who lived in the country. ".repeat(6)}</p>
<p>${"In great fear the Mice scurried to a hiding place. ".repeat(6)}</p>
<a href="images/i010.jpg"><img alt="The Country Mouse hurries away with her umbrella" src="images/i010_th.jpg"></a>
<p>Poverty with security is better than plenty in the midst of fear.</p>
</body></html>`;

const COLLECTION_HINTS = {
  publisher: "Rand McNally & Company",
  ageGroup: "6-8" as const,
  collection: { first: "THE FOX AND THE GRAPES", skip: ["MERCURY AND THE WOODMAN"], categories: ["fables", "animals"] },
};

describe("parseGutenbergCollection", () => {
  it("makes one story per illustrated heading, every page with a picture, and leaves out skipped and unillustrated ones", () => {
    const { stories, warnings } = parseGutenbergCollection(COLLECTION_HTML, COLLECTION_HINTS);
    expect(stories.map((story) => [story.number, story.title])).toEqual([
      [1, "The Fox and the Grapes"],
      [4, "The Town Mouse and the Country Mouse"],
    ]);
    expect(warnings).toEqual(["left out, no picture: THE BUNDLE OF STICKS"]);
    expect(stories[0].pages).toEqual([
      {
        text: "A Fox one day spied a beautiful bunch of ripe grapes hanging from a vine.\nAgain and again he tried, but in vain.\nThere are many who pretend to despise that which is beyond their reach.",
        imagePath: "images/i011_th.jpg",
      },
    ]);
    const mouse = stories[1].pages;
    expect(mouse.length).toBeGreaterThan(1);
    expect(mouse.every((page) => page.imagePath)).toBe(true);
    expect(mouse[0].imagePath).toBe("images/i009_th.jpg");
    // The linked full-size picture stands for its thumbnail, and its real alt text is kept.
    expect(mouse[mouse.length - 1]).toMatchObject({ imagePath: "images/i010.jpg", imageAlt: "The Country Mouse hurries away with her umbrella" });
    // The one-line moral joins the page before it.
    expect(mouse[mouse.length - 1].text).toMatch(/hiding place\.\nPoverty with security/);
  });

  it("refuses a collection whose first story is not found", () => {
    expect(() => parseGutenbergCollection(COLLECTION_HTML, { collection: { first: "THE LION AND THE MOUSE" } })).toThrow(GutenbergError);
  });

  it("title-cases headings", () => {
    expect(gutenbergTitleCase("THE ASS IN THE LION'S SKIN")).toBe("The Ass in the Lion's Skin");
    expect(gutenbergTitleCase("A RAVEN AND A SWAN")).toBe("A Raven and a Swan");
  });

  it("is on the curated list as a collection, held back until Milo Winter's works are free in Israel", () => {
    const aesop = gutenbergCuratedBook("19994");
    expect(aesop?.collection?.first).toBe("THE WOLF AND THE KID");
    expect(aesop?.collection?.categories).toContain("fables");
  });
});

describe("importGutenbergCollection", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  const routes = (rdf = RDF): Record<string, StubResponse> => ({
    [`${BASE}/pg14838.rdf`]: { body: rdf },
    [`${BASE}/pg14838-images.html`]: { body: COLLECTION_HTML },
    [`${BASE}/images/i011_th.jpg`]: { body: JPEG },
    [`${BASE}/images/i009_th.jpg`]: { body: JPEG },
    [`${BASE}/images/i010.jpg`]: { body: JPEG },
  });

  it("creates one English draft per story with its categories, and skips them the second time", async () => {
    const options = { id: "14838", ownerId: "system", repo: data.repo, media: data.media, hints: COLLECTION_HINTS };
    const { client: reader } = client(routes());
    const result = await importGutenbergCollection({ ...options, client: reader });
    expect(result.stories.map((story) => [story.status, story.book.id])).toEqual([
      ["created", "gutenberg-14838-001"],
      ["created", "gutenberg-14838-004"],
    ]);
    const fox = result.stories[0].book;
    expect(fox).toMatchObject({
      slug: "gutenberg-the-fox-and-the-grapes",
      title: "The Fox and the Grapes",
      status: "draft",
      language: "en",
      ageGroup: "6-8",
      categories: ["fables", "animals"],
      license: "Public domain",
      author: "Beatrix Potter",
      coverImage: "books/gutenberg-14838-001/picture-1.jpg",
    });
    expect(fox.credits?.originalTitle).toBe("The Fox and the Grapes");
    expect(await data.media.list("books/gutenberg-14838-004")).toHaveLength(2);

    const again = await importGutenbergCollection({ ...options, client: client(routes()).client });
    expect(again.stories.map((story) => story.status)).toEqual(["skipped", "skipped"]);
  });

  it("refuses the whole collection when a creator died too recently, before its text is fetched", async () => {
    const { client: reader, calls } = client(routes(RDF.replace(">1943</pgterms:deathdate>", ">1956</pgterms:deathdate>")));
    await expect(
      importGutenbergCollection({ id: "14838", ownerId: "system", repo: data.repo, media: data.media, hints: COLLECTION_HINTS, client: reader }),
    ).rejects.toMatchObject({ code: "license" });
    expect(calls).toEqual([`${BASE}/pg14838.rdf`]);
  });
});

describe("gutenbergLicenseProblem with death years looked up by hand", () => {
  const aesop: GutenbergRecord = {
    title: "The Aesop for Children",
    subtitle: "",
    rights: GUTENBERG.rights,
    languages: ["en"],
    creators: [
      { name: "Aesop", role: "author" },
      { name: "Milo Winter", role: "illustrator", born: 1888, died: 1956 },
    ],
  };

  it("accepts an ancient author's hand-filled death year, and still checks the other creators", () => {
    expect(gutenbergLicenseProblem(aesop)).toBe("the death year of Aesop is unknown");
    expect(gutenbergLicenseProblem(aesop, { deathYears: { Aesop: -564 } })).toBe(`Milo Winter died in 1956, after ${GUTENBERG.latestDeathYear}`);
    const free = { ...aesop, creators: [aesop.creators[0], { ...aesop.creators[1], died: 1950 }] };
    expect(gutenbergLicenseProblem(free, { deathYears: { Aesop: -564 } })).toBeUndefined();
  });
});
