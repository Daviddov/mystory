import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { missingCreditRoles } from "@/lib/credits";
import { publishProblems } from "@/lib/studio/shared";
import { createTempData, type TempData } from "@/test/temp-data";
import {
  BOOKDASH,
  BookDashClient,
  BookDashError,
  bookDashBookId,
  bookDashSourceUrl,
  findBookDashBook,
  importBookDashBook,
  parseBookDashMarkdown,
  parseBookDashMeta,
  type FetchLike,
} from "./bookdash";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
/** Copied unchanged from bookdash/bookdash-books (gh-pages): sleepy-mr-sloth/en/index.md. */
const SLOTH_MD = readFileSync(path.join(FIXTURES, "bookdash-sleepy-mr-sloth.md"), "utf8");
/** The head of _data/meta.yml and two real entries (a-fish-and-a-gift, sleepy-mr-sloth). */
const META_YML = readFileSync(path.join(FIXTURES, "bookdash-meta.yml"), "utf8");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

interface StubResponse {
  status?: number;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
}

/** A fetch that serves a fixed map of URLs and records every request. Unknown URLs are 404. */
function stubFetch(routes: Record<string, StubResponse>): { fetch: FetchLike; calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
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

function slothRoutes(extra: Record<string, StubResponse> = {}): Record<string, StubResponse> {
  const base = `${BOOKDASH.rawBase}/sleepy-mr-sloth/en`;
  const routes: Record<string, StubResponse> = {
    [`${base}/index.md`]: { body: SLOTH_MD },
    [`${BOOKDASH.rawBase}/_data/meta.yml`]: { body: META_YML },
    [`${base}/images/cover.jpg`]: { body: JPEG },
    [`${base}/images/book-dash-logo.png`]: { body: PNG },
  };
  for (let i = 1; i <= 12; i++) routes[`${base}/images/${String(i).padStart(2, "0")}.jpg`] = { body: JPEG };
  return { ...routes, ...extra };
}

describe("parseBookDashMarkdown", () => {
  it("reads the real Sleepy Mr Sloth file: title, 12 pages, image names, alt texts and text", () => {
    const book = parseBookDashMarkdown(SLOTH_MD);
    expect(book.title).toBe("Sleepy Mr Sloth");
    expect(book.warnings).toEqual([]);
    expect(book.pages).toHaveLength(12);
    expect(book.pages.map((page) => page.imageFile)).toEqual(
      Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}.jpg`),
    );
    expect(book.pages[0]).toEqual({
      imageFile: "01.jpg",
      imageAlt: "Mr Sloth is sleepy and yawning.",
      text: "One day, Mr Sloth came to visit. He said:\nI’m sleepy! I need a good branch for a bed!",
    });
    expect(book.pages[1].text).toBe("I’m quite good at climbing. I know how to swing.\nBut sleeping’s my favourite, favourite thing!");
    expect(book.pages[11]).toEqual({
      imageFile: "12.jpg",
      imageAlt: "Mr Sloth and the animals are all sleeping nicely in the tree together.",
      text: "The bird and the snake, the giraffe and each bee\nwere happy to have Mr Sloth in their tree.",
    });
    // No markdown or template syntax leaks into the story.
    for (const page of book.pages) expect(page.text).not.toMatch(/[{}[\]]|site\.image-set|^#|  $/m);
  });

  it("accepts the other image link style, CRLF, soft line wraps and inline markdown", () => {
    const md = [
      "---",
      'title: "Zanele: My story"',
      "---",
      "",
      "# Ignored heading",
      "",
      "![Papa waves.](images/03.jpg){:.wide}",
      "",
      "The fishermen *watch*",
      "the **sun** rise.",
      "",
      "They check [their nets](http://example.com).",
      "{:.note}",
      "",
      "![](images/04.jpg)",
      "",
      "![No text here.](images/05.jpg)",
    ].join("\r\n");
    const book = parseBookDashMarkdown(md);
    expect(book.title).toBe("Zanele: My story");
    expect(book.pages).toEqual([
      { imageFile: "03.jpg", imageAlt: "Papa waves.", text: "The fishermen watch the sun rise.\nThey check their nets." },
      { imageFile: "04.jpg", text: "" },
      { imageFile: "05.jpg", imageAlt: "No text here.", text: "" },
    ]);
    expect(book.warnings).toEqual([
      "page 2 has a picture but no text",
      "page 2 has no image description",
      "page 3 has a picture but no text",
    ]);
  });

  it("keeps text that comes before the first image and falls back to the heading for the title", () => {
    const book = parseBookDashMarkdown("# A Title\n\nOnce upon a time.\n\n![A cat.](images/01.jpg)\n\nThe cat sat.\n");
    expect(book.title).toBe("A Title");
    expect(book.pages).toEqual([
      { text: "Once upon a time." },
      { imageFile: "01.jpg", imageAlt: "A cat.", text: "The cat sat." },
    ]);
    expect(book.warnings).toEqual(["page 1 has text but no picture"]);
  });

  it("never turns an image reference into a path outside the images folder", () => {
    const book = parseBookDashMarkdown("# T\n\n![x](../../secret/.env)\n\nText.\n\n![y](http://evil.example/a.php?x=1.jpg)\n\nMore.\n");
    expect(book.pages.map((page) => page.imageFile)).toEqual([undefined, undefined]);
    expect(book.warnings.filter((warning) => warning.startsWith("image reference skipped"))).toHaveLength(2);
  });
});

describe("parseBookDashMeta", () => {
  it("reads title, description and the creator list of each book, ignoring translations and comments", () => {
    const meta = parseBookDashMeta(META_YML);
    expect([...meta.keys()]).toEqual(["a-fish-and-a-gift", "sleepy-mr-sloth"]);
    expect(meta.get("sleepy-mr-sloth")).toEqual({
      title: "Sleepy Mr Sloth",
      subtitle: "",
      creator: "Graham Paterson, Paul Kennedy, Nick Mulgrew",
      description: "He’s quite good at climbing. He knows how to swing. But sleeping’s his favourite, favourite thing!",
      date: "2014-05-10",
    });
    // The French title under translations: must not replace the book's own title.
    expect(meta.get("a-fish-and-a-gift")?.title).toBe("A Fish and a Gift");
    expect(meta.get("a-fish-and-a-gift")?.creator).toBe("Liesl Jobson, Jesse Breytenbach, Andy Thesen");
  });
});

describe("BookDashClient", () => {
  it("lists book folders through the API with the token, and files through raw URLs without it", async () => {
    const listing = JSON.stringify([
      { name: "_data", type: "dir" },
      { name: "css", type: "dir" },
      { name: "README.md", type: "file" },
      { name: "sleepy-mr-sloth", type: "dir" },
      { name: "what-if", type: "dir" },
    ]);
    const { fetch, calls } = stubFetch({
      [`${BOOKDASH.apiBase}/?ref=gh-pages`]: { body: listing },
      [`${BOOKDASH.rawBase}/_data/meta.yml`]: { body: META_YML },
    });
    const client = new BookDashClient({ fetch, githubToken: "secret-token" });
    const catalogue = await client.catalogue();
    expect(catalogue.complete).toBe(true);
    expect(catalogue.entries).toEqual([
      {
        slug: "sleepy-mr-sloth",
        title: "Sleepy Mr Sloth",
        description: "He’s quite good at climbing. He knows how to swing. But sleeping’s his favourite, favourite thing!",
        creators: "Graham Paterson, Paul Kennedy, Nick Mulgrew",
      },
      { slug: "what-if", title: "what-if", description: "", creators: "" },
    ]);
    const api = calls.find((call) => call.url.startsWith(BOOKDASH.apiBase));
    const raw = calls.find((call) => call.url.startsWith(BOOKDASH.rawBase));
    expect(api?.headers.Authorization).toBe("Bearer secret-token");
    expect(raw?.headers.Authorization).toBeUndefined();
  });

  it("falls back to meta.yml when the API is rate limited", async () => {
    const { fetch } = stubFetch({
      [`${BOOKDASH.apiBase}/?ref=gh-pages`]: { status: 403, headers: { "x-ratelimit-remaining": "0" } },
      [`${BOOKDASH.rawBase}/_data/meta.yml`]: { body: META_YML },
    });
    const catalogue = await new BookDashClient({ fetch }).catalogue();
    expect(catalogue.complete).toBe(false);
    expect(catalogue.entries.map((entry) => entry.slug)).toEqual(["a-fish-and-a-gift", "sleepy-mr-sloth"]);
  });

  it("refuses a file that is not an image", async () => {
    const { fetch } = stubFetch({
      [`${BOOKDASH.rawBase}/sleepy-mr-sloth/en/images/01.jpg`]: { body: "<html>not a picture</html>" },
    });
    const client = new BookDashClient({ fetch });
    await expect(client.image("sleepy-mr-sloth", "01.jpg")).rejects.toMatchObject({ code: "media" });
    await expect(client.image("sleepy-mr-sloth", "../x.jpg")).rejects.toMatchObject({ code: "media" });
  });
});

describe("importBookDashBook", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  it("creates an English draft with images, alt texts, credits and the logo, and no guessed roles", async () => {
    const { fetch, calls } = stubFetch(slothRoutes());
    const result = await importBookDashBook({
      slug: "sleepy-mr-sloth",
      ownerId: "system",
      repo: data.repo,
      media: data.media,
      client: new BookDashClient({ fetch }),
    });
    expect(result.status).toBe("created");
    expect(result.warnings).toEqual([]);
    const book = result.book;
    expect(book).toMatchObject({
      id: bookDashBookId("sleepy-mr-sloth"),
      slug: "sleepy-mr-sloth",
      title: "Sleepy Mr Sloth",
      status: "draft",
      origin: "import",
      ownerId: "system",
      language: "en",
      originalLanguage: "en",
      license: "CC BY 4.0",
      source: bookDashSourceUrl("sleepy-mr-sloth"),
      author: "",
      illustrator: "",
      coverImage: "books/bookdash-sleepy-mr-sloth/cover.jpg",
      credits: {
        creators: "Graham Paterson, Paul Kennedy, Nick Mulgrew",
        publisher: "Book Dash",
        publisherUrl: "https://bookdash.org",
        publisherLogo: "books/bookdash-sleepy-mr-sloth/publisher-logo.png",
        attributionLine: "Originally published by Book Dash under a Creative Commons CC BY 4.0 license.",
        originalTitle: "Sleepy Mr Sloth",
      },
    });
    expect(book.summary).toContain("sleeping’s his favourite");
    expect(book.credits?.designer).toBeUndefined();
    expect(book.credits?.translator).toBeUndefined();
    expect(missingCreditRoles(book)).toEqual(["author", "illustrator", "designer", "editor"]);

    expect(book.pages).toHaveLength(12);
    expect(book.pages[0]).toEqual({
      index: 0,
      text: "One day, Mr Sloth came to visit. He said:\nI’m sleepy! I need a good branch for a bed!",
      originalText: "One day, Mr Sloth came to visit. He said:\nI’m sleepy! I need a good branch for a bed!",
      imageAlt: "Mr Sloth is sleepy and yawning.",
      image: "books/bookdash-sleepy-mr-sloth/page-01.jpg",
    });
    expect(await data.media.list("books/bookdash-sleepy-mr-sloth")).toHaveLength(14);
    expect((await data.media.get("books/bookdash-sleepy-mr-sloth/publisher-logo.png"))?.contentType).toBe("image/png");
    // 1 markdown + 1 metadata + 12 pages + cover + logo; the GitHub API is not needed for one book.
    expect(calls).toHaveLength(16);
    expect(calls.every((call) => call.url.startsWith(BOOKDASH.rawBase))).toBe(true);

    // The book survives a round trip through storage and cannot be submitted while it is in English.
    expect(await findBookDashBook(data.repo, "sleepy-mr-sloth")).toEqual(book);
    expect(publishProblems(book).map((problem) => problem.code)).toContain("language");
  });

  it("is idempotent: a second import changes nothing, --force replaces the copy", async () => {
    const { fetch, calls } = stubFetch(slothRoutes());
    const options = {
      slug: "sleepy-mr-sloth",
      ownerId: "system",
      repo: data.repo,
      media: data.media,
      client: new BookDashClient({ fetch }),
    };
    const first = await importBookDashBook(options);
    await data.repo.updateBook(first.book.id, { title: "מר עצלן הישנוני", language: "he" });
    const requests = calls.length;

    const second = await importBookDashBook(options);
    expect(second.status).toBe("skipped");
    expect(second.book.title).toBe("מר עצלן הישנוני");
    expect(calls).toHaveLength(requests);

    const forced = await importBookDashBook({ ...options, ownerId: "u_other", force: true });
    expect(forced.status).toBe("replaced");
    expect(forced.book).toMatchObject({ title: "Sleepy Mr Sloth", language: "en", ownerId: "u_other" });
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(1);
  });

  it("refuses to replace a published book", async () => {
    const { fetch } = stubFetch(slothRoutes());
    const options = { slug: "sleepy-mr-sloth", ownerId: "system", repo: data.repo, media: data.media, client: new BookDashClient({ fetch }) };
    const first = await importBookDashBook(options);
    await data.repo.updateBook(first.book.id, { status: "published", language: "he" });
    await expect(importBookDashBook({ ...options, force: true })).rejects.toBeInstanceOf(BookDashError);
    expect((await data.repo.getBookById(first.book.id))?.status).toBe("published");
  });

  it("stores nothing when an illustration is missing", async () => {
    const routes = slothRoutes();
    delete routes[`${BOOKDASH.rawBase}/sleepy-mr-sloth/en/images/07.jpg`];
    const { fetch } = stubFetch(routes);
    await expect(
      importBookDashBook({ slug: "sleepy-mr-sloth", ownerId: "system", repo: data.repo, media: data.media, client: new BookDashClient({ fetch }) }),
    ).rejects.toMatchObject({ code: "media" });
    expect(await findBookDashBook(data.repo, "sleepy-mr-sloth")).toBeNull();
    expect(await data.media.list("books/bookdash-sleepy-mr-sloth")).toEqual([]);
  });

  it("imports without the optional files and says what is missing", async () => {
    const routes = slothRoutes();
    delete routes[`${BOOKDASH.rawBase}/sleepy-mr-sloth/en/images/cover.jpg`];
    delete routes[`${BOOKDASH.rawBase}/sleepy-mr-sloth/en/images/book-dash-logo.png`];
    routes[`${BOOKDASH.rawBase}/_data/meta.yml`] = { body: "titles:\n" };
    const { fetch } = stubFetch(routes);
    const result = await importBookDashBook({
      slug: "sleepy-mr-sloth",
      ownerId: "system",
      repo: data.repo,
      media: data.media,
      client: new BookDashClient({ fetch }),
    });
    expect(result.book.coverImage).toBe("books/bookdash-sleepy-mr-sloth/page-01.jpg");
    expect(result.book.credits).toEqual({
      publisher: "Book Dash",
      publisherUrl: "https://bookdash.org",
      attributionLine: BOOKDASH.attributionLine,
      originalTitle: "Sleepy Mr Sloth",
    });
    expect(result.book.summary).toBe("");
    expect(result.warnings.join("\n")).toMatch(/not listed in _data\/meta\.yml/);
    expect(result.warnings.join("\n")).toMatch(/logo is missing/);
  });

  it("refuses an unfinished book that has pictures but no story text", async () => {
    const pictures = Array.from({ length: 12 }, (_, i) => `![]({{ site.image-set }}/${String(i + 1).padStart(2, "0")}.jpg)`);
    const { fetch, calls } = stubFetch(
      slothRoutes({
        [`${BOOKDASH.rawBase}/sleepy-mr-sloth/en/index.md`]: {
          body: ["---", "title: Hugs", "---", "", "# Hugs", "", pictures.join("\n\n"), ""].join("\n"),
        },
      }),
    );
    await expect(
      importBookDashBook({ slug: "sleepy-mr-sloth", ownerId: "system", repo: data.repo, media: data.media, client: new BookDashClient({ fetch }) }),
    ).rejects.toMatchObject({ code: "no-text" });
    // Refused before any picture is downloaded.
    expect(calls).toHaveLength(1);
    expect(await findBookDashBook(data.repo, "sleepy-mr-sloth")).toBeNull();
  });

  it("rejects unknown books and unsafe slugs", async () => {
    const { fetch, calls } = stubFetch({});
    const base = { ownerId: "system", repo: data.repo, media: data.media, client: new BookDashClient({ fetch }) };
    await expect(importBookDashBook({ ...base, slug: "no-such-book" })).rejects.toMatchObject({ code: "not-found" });
    await expect(importBookDashBook({ ...base, slug: "../etc" })).rejects.toMatchObject({ code: "invalid-slug" });
    await expect(importBookDashBook({ ...base, slug: "css" })).rejects.toMatchObject({ code: "invalid-slug" });
    expect(calls).toHaveLength(1);
  });
});
