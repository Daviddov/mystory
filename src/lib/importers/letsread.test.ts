import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { publishProblems } from "@/lib/studio/shared";
import { createTempData, type TempData } from "@/test/temp-data";
import type { FetchLike } from "./bookdash";
import {
  LETSREAD,
  LetsReadClient,
  LetsReadError,
  findLetsReadBook,
  importLetsReadBook,
  letsReadBookId,
  letsReadCatalogueProblem,
  letsReadKnownTitles,
  letsReadSkippedPublisher,
  letsReadSourceUrl,
  letsReadTitleKey,
  parseLetsReadBook,
  parseLetsReadCatalogue,
  parseLetsReadCredits,
} from "./letsread";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
/**
 * Real answers of v5/book/preview/language/<English>/book/<id>, without the fields the importer does not
 * read (tags, the other languages, the thumbnail addresses, photos of the collaborators):
 * "Nettle Medicine" (The Asia Foundation, CC BY 4.0; a sponsor page and a glossary after the story) and
 * "Going to School" (Room to Read, CC BY 4.0; a title page in front, a wordless page, a sponsor page).
 */
const NETTLE = readFileSync(path.join(FIXTURES, "letsread-book-11d8362d.json"), "utf8");
const SCHOOL = readFileSync(path.join(FIXTURES, "letsread-book-4201285e.json"), "utf8");
/** The real attribution pages (Copyright.xhtml of the EPUB) of "Nettle Medicine" and of "The Bell", which is CC BY-NC. */
const NETTLE_CREDITS = readFileSync(path.join(FIXTURES, "letsread-credits-11d8362d.xhtml"), "utf8");
const BELL_CREDITS = readFileSync(path.join(FIXTURES, "letsread-credits-75e588cf.xhtml"), "utf8");
/** Four real entries of v5/book/search: Nettle Medicine, The Bell (CC BY-NC), a Book Dash book and an "all rights reserved" one. */
const CATALOGUE = readFileSync(path.join(FIXTURES, "letsread-catalogue.json"), "utf8");

const NETTLE_ID = "11d8362d-7af9-4293-be6a-28046c5d6fef";
const SCHOOL_ID = "4201285e-5041-44da-8221-1a5ecaeb3044";
const PREVIEW = `${LETSREAD.apiBase}/v5/book/preview/language/${LETSREAD.languageId}/book`;
const SEARCH = `${LETSREAD.apiBase}/v5/book/search?cardName=&limit=20&fLimit=20&lId=${LETSREAD.languageId}&cursor=`;
const NETTLE_EPUB = (JSON.parse(NETTLE) as { epubUrl: string }).epubUrl;
const NETTLE_IMAGES = `${LETSREAD.mediaBase}${NETTLE_ID}`;
const NETTLE_COVER = `${LETSREAD.mediaBase}assets/images/cd594b64-41ac-4956-a26c-191146d47614.jpg`;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

interface StubResponse {
  status?: number;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  /** Answer a Range request with the whole file, as a server that does not know ranges would. */
  ignoreRange?: boolean;
}

/**
 * A fetch that serves a fixed map of URLs and records every request ("<url> [<range>]" for a range
 * request). It answers "bytes=-n" and "bytes=a-b" the way the storage does. Unknown URLs are 404.
 */
function stubFetch(routes: Record<string, StubResponse>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const range = init?.headers?.Range;
    calls.push(range ? `${url} [${range}]` : url);
    const route = routes[url] ?? { status: 404, body: "Not Found" };
    let status = route.status ?? 200;
    const body = route.body ?? "";
    let bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const headers: Record<string, string> = { ...route.headers };
    const asked = /^bytes=(\d*)-(\d*)$/.exec(range ?? "");
    if (asked && status === 200 && !route.ignoreRange) {
      const total = bytes.length;
      const from = asked[1] === "" ? Math.max(0, total - Number(asked[2])) : Number(asked[1]);
      const to = asked[1] === "" || asked[2] === "" ? total - 1 : Math.min(total - 1, Number(asked[2]));
      bytes = bytes.subarray(from, to + 1);
      status = 206;
      headers["content-range"] = `bytes ${from}-${to}/${total}`;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };
  };
  return { fetch, calls };
}

/** An EPUB like Let's Read's: the attribution page somewhere in the middle, pictures and a big font around it. */
async function epub(credits: string | null, fillerBytes = 150_000): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("OEBPS/p-1.jpg", JPEG);
  if (credits !== null) zip.file("OEBPS/Copyright.xhtml", credits);
  // Random bytes do not compress, so the page above stays far from the end of the file.
  const filler = new Uint8Array(fillerBytes);
  for (let i = 0; i < filler.length; i++) filler[i] = (i * 2654435761) >>> 24;
  zip.file("OEBPS/font.woff", filler, { compression: "STORE" });
  zip.file("OEBPS/content.opf", "<package/>");
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

let NETTLE_ZIP: Uint8Array;
let BELL_ZIP: Uint8Array;
beforeAll(async () => {
  NETTLE_ZIP = await epub(NETTLE_CREDITS);
  BELL_ZIP = await epub(BELL_CREDITS);
});

function nettleRoutes(extra: Record<string, StubResponse> = {}): Record<string, StubResponse> {
  const routes: Record<string, StubResponse> = {
    [`${PREVIEW}/${NETTLE_ID}`]: { body: NETTLE },
    [NETTLE_EPUB]: { body: NETTLE_ZIP },
    [NETTLE_COVER]: { body: PNG },
  };
  for (let i = 1; i <= 12; i++) routes[`${NETTLE_IMAGES}/p-${i}.jpg`] = { body: JPEG };
  return { ...routes, ...extra };
}

/** The Nettle Medicine answer with some fields replaced. */
function nettleWith(patch: Record<string, unknown>): string {
  return JSON.stringify({ ...(JSON.parse(NETTLE) as Record<string, unknown>), ...patch });
}

describe("parseLetsReadBook", () => {
  it("reads the real Nettle Medicine: 12 story pages, the people by role, no sponsor page and no glossary", () => {
    const book = parseLetsReadBook(JSON.parse(NETTLE));
    expect(book).toMatchObject({
      id: NETTLE_ID,
      title: "Nettle Medicine",
      description: "Nhorbu and his grandmother pick a plant to make a healing soup for grandfather. But the plant stings Nhorbu! What else can the plant do?",
      license: "CC BY 4.0",
      level: "1",
      // The record says http; everything is fetched over https.
      coverImageUrl: NETTLE_COVER,
      epubUrl: NETTLE_EPUB,
      publisher: "The Asia Foundation - Let's Read",
      author: "Buddha Yonjan Lama",
      illustrator: "",
      translator: "",
      editor: "Kumudini Gurung Shrestha",
      creators: "Sushma Maharjan, Kumudini Gurung Shrestha, Srijanalaya",
      warnings: ["the record names no illustrator"],
    });
    // "https://letsreadasia.org/" is the library itself, not the address of an original.
    expect(book.originalUrl).toBeUndefined();
    expect(book.skippedPublisher).toBeUndefined();

    // Of 14 pages: the sponsor page and the "Wonderful Words" glossary after the story are dropped.
    expect(book.pages).toHaveLength(12);
    expect(book.pages.map((page) => page.imageUrl)).toEqual(Array.from({ length: 12 }, (_, i) => `${NETTLE_IMAGES}/p-${i + 1}.jpg`));
    expect(book.pages[2]).toEqual({ imageUrl: `${NETTLE_IMAGES}/p-3.jpg`, text: "Maam picks the nettle leaves.\nShe sings, too." });
    expect(book.pages[0].text).toBe(
      'Nhorbu loves to spend time with his grandparents.\nToday, Aakhe shapes the makhundo.\n"Maam, let us have some nettle soup with dhindo today," Aakhe says.\n"My body is aching."',
    );
    expect(book.pages[11].text).toBe("A few days later, the baby goat's leg is all better.\nIt plays in the courtyard happily.\nNhorbu's house is happy again.");
    for (const page of book.pages) expect(page.text).not.toMatch(/[<>]|&[a-z#0-9]+;| |Wonderful Words|made possible/);
  });

  it("reads an author that book.authors names only by firstname and lastname (Douangkeo Wants to Be a Magician)", () => {
    const book = parseLetsReadBook(
      JSON.parse(nettleWith({ collaboratorsByRole: {}, authors: [{ firstname: "Fongsamay  Phommaxay", lastname: "" }] })),
    );
    expect(book.author).toBe("Fongsamay Phommaxay");
    expect(parseLetsReadBook(JSON.parse(nettleWith({ collaboratorsByRole: {}, authors: [{ firstname: "Ada", lastname: "Writer" }] }))).author).toBe(
      "Ada Writer",
    );
    expect(
      parseLetsReadBook(JSON.parse(nettleWith({ collaboratorsByRole: {}, authors: [{ firstname: "Hoàng Ngọc Đoan Trang and Phùng Nguyên Quang" }] }))).author,
    ).toBe("Hoàng Ngọc Đoan Trang, Phùng Nguyên Quang");
  });

  it("drops the title page of the real Going to School and keeps its wordless page", () => {
    const book = parseLetsReadBook(JSON.parse(SCHOOL));
    expect(book).toMatchObject({
      id: SCHOOL_ID,
      title: "Going to School",
      publisher: "Room to Read",
      author: "Phuangthana Phetsavong",
      illustrator: "Olod Sanethichak",
      editor: "Sengmany Souphanthalop, Onchanh Phetchantharath, Pakian Luangxaysana",
      creators: "",
    });
    // Of 13 pages: "Going To School" in front and the USAID page at the end are dropped.
    expect(book.pages).toHaveLength(11);
    expect(book.pages[0]).toEqual({
      imageUrl: `${LETSREAD.mediaBase}${SCHOOL_ID}/Images/p-2.png`,
      imageAlt: "There are many stilt houses in the picture.",
      text: "On the first day of school, Vanna carries his backpack to school.",
    });
    expect(book.pages[1].text).toBe("");
    expect(book.pages[10].text).toBe("There is a hand-washing basin and restroom.\nVanna is happy to wash his hands with his friends.");
    expect(book.warnings).toEqual(["page 2 has a picture but no text"]);
  });

  it("tells a title page from a first sentence, back matter from the story, and a print-size picture from a normal one", () => {
    const page = (pageNum: number, html: string, image: string, extra: Record<string, unknown> = {}) => ({
      pageNum,
      extractedLongContentValue: html,
      imageUrl: image ? `${LETSREAD.mediaBase}${image}` : "",
      ...extra,
    });
    const serving = "https://lh3.googleusercontent.com/LowcRbY7bKP7tt6IF_JSTJH_3Nx4gSr6AHa43a6V6DFWBReTAhitbMg";
    const book = parseLetsReadBook({
      masterBookId: SCHOOL_ID,
      languageId: LETSREAD.languageId,
      name: "Crab and Fish Are Friends",
      license: "CC-BY-4.0",
      coverImageUrl: `${LETSREAD.mediaBase}assets/images/cover-1.png`,
      originalUrl: "http://bookdash.org/crab-and-fish/",
      authors: ["Ada  Writer"],
      illustrator: "Ian Painter",
      collaboratorsByRole: { AUTHOR: [{ name: "Ada Writer" }, { name: "Ben Writer " }], PUBLISHER: [{ name: "Room to Read" }], TRANSLATOR: [{ name: "Tal Translator" }] },
      pages: [
        // Out of order on purpose: pages are sorted by their number.
        page(3, "Crab has two <em>beautiful</em> eyes.&nbsp;<br/>&#34;Look!&#34;<br/><br/>", "b/Images/p-2.jpg", { alttext: " Crab opens its eyes. " }),
        page(1, "<em>Crab and Fish Are Friends</em><br/>Written by Ada Writer<br/>Illustrated by Ian Painter", "b/Images/cover.png"),
        page(2, "Crab and Fish are friends.<br/>\n", "b/Images/p-1.jpg", { imageWidth: 4016, imageServingUrl: serving }),
        page(4, "..<br/>\n", "b/Images/p-3.jpg"),
        page(5, "", "", { deleted: false }),
        page(6, "We thank everyone.", "https://evil.example/x.png"),
        page(7, "Deleted.", "b/Images/p-9.jpg", { deleted: true }),
        page(8, "The end", "b/Images/p-4.jpg"),
        page(9, "<b>Question #1:</b> Who has a forked tail?", "assets/images/q.jpg"),
        page(10, "&nbsp;<br/>", "b/Images/back.png"),
      ],
    });
    expect(book.pages).toEqual([
      // A picture wider than 1600 pixels is asked from the site's image server in that width.
      { imageUrl: `${serving}=w1600`, text: "Crab and Fish are friends." },
      { imageUrl: `${LETSREAD.mediaBase}b/Images/p-2.jpg`, imageAlt: "Crab opens its eyes.", text: 'Crab has two beautiful eyes.\n"Look!"' },
      // A line of dots is a placeholder, not text.
      { imageUrl: `${LETSREAD.mediaBase}b/Images/p-3.jpg`, text: "" },
    ]);
    expect(book).toMatchObject({ author: "Ada Writer, Ben Writer", illustrator: "Ian Painter", translator: "Tal Translator", publisher: "Room to Read" });
    expect(book.originalUrl).toBe("http://bookdash.org/crab-and-fish/");
    // The publisher is Room to Read, but the original lives on Book Dash's site.
    expect(book.skippedPublisher).toBe("Book Dash");
    expect(book.warnings).toContain("page 3 has a picture but no text");
    expect(book.epubUrl).toBeUndefined();
  });

  it("refuses an answer that is not an English book with pages", () => {
    expect(() => parseLetsReadBook({ error: { message: "Book not found." } })).toThrow(LetsReadError);
    expect(() => parseLetsReadBook(JSON.parse(nettleWith({ languageId: "6198363926036480" })))).toThrow(/not the English edition/);
    expect(() => parseLetsReadBook(JSON.parse(nettleWith({ pages: [] })))).toThrow(/holds no pages/);
    expect(() => parseLetsReadBook([])).toThrow(LetsReadError);
  });
});

describe("parseLetsReadCredits", () => {
  it("reads the license, the makers and the attribution sentences of a real attribution page", () => {
    const credits = parseLetsReadCredits(NETTLE_CREDITS);
    expect(credits.statedLicenses).toEqual(["CC BY 4.0"]);
    expect(credits.publisher).toBe("The Asia Foundation - Let's Read");
    expect(credits.author).toBe("Buddha Yonjan Lama");
    // "Illustrator:." on the page names nobody.
    expect(credits.illustrator).toBe("");
    expect(credits.attribution).toBe(
      "Original Story Nettle Medicine. Author: Buddha Yonjan Lama. Editor: Kumudini Gurung Shrestha. Contributor: Srijanalaya, Sushma Maharjan, Kumudini Gurung Shrestha. " +
        "Published by The Asia Foundation - Let's Read, https://letsreadasia.org/ © The Asia Foundation - Let's Read. Released under CC-BY-4.0. " +
        "This work is a modified version of the original story. @The Asia Foundation – Let’s Read, 2023. Some rights reserved. Released under CC-BY-4.0.",
    );
    // The presentation of Let's Read above the credits is not part of them.
    expect(credits.attribution).not.toMatch(/Brought to you by|initiative/);
  });

  it("reads CC BY-NC from the page of a book that is not free for every use", () => {
    const credits = parseLetsReadCredits(BELL_CREDITS);
    expect(credits.statedLicenses).toEqual(["CC BY-NC 4.0"]);
    expect(credits.author).toBe("Jason Paisoi");
    expect(credits.illustrator).toBe("Eskoi Ismael Bogen");
    expect(credits.publisher).toBe("The Asia Foundation - Let's Read");
  });

  it("drops the placeholder of a missing address and finds no license where none is stated", () => {
    const page = '<body><div class="attribution__bottom"><p>Original Story<br/><span>Who?<em></em>.</span><span> Author: A B.</span></p><p><span> Published by Room to Read, </span><span><a href="#_url_#">#_url_#</a></span><span> &#169; Room to Read. </span></p></div></body>';
    const credits = parseLetsReadCredits(page);
    expect(credits.attribution).toBe("Original Story Who? Author: A B. Published by Room to Read © Room to Read.");
    expect(credits.publisher).toBe("Room to Read");
    expect(credits.statedLicenses).toEqual([]);
    expect(parseLetsReadCredits(page.replace("Room to Read. ", "Pratham Books. ")).text).toMatch(/Pratham/);
  });
});

describe("parseLetsReadCatalogue", () => {
  it("reads id, license, level and size of each entry, and the cursor of the next page", () => {
    const { entries, cursor } = parseLetsReadCatalogue(JSON.parse(CATALOGUE));
    // The id is the masterBookId, which the English edition of a translated book does not share.
    expect(entries.map((entry) => entry.id)).toEqual([NETTLE_ID, "75e588cf-dffb-4230-8532-f66335b1ec2b", "19885981-eed4-4d4d-9cdb-b7568c32bc21", "31b0f994-74b9-4c9f-bb4d-be128824f638"]);
    expect(entries[0]).toEqual({
      id: NETTLE_ID,
      title: "Nettle Medicine",
      description: "Nhorbu and his grandmother pick a plant to make a healing soup for grandfather. But the plant stings Nhorbu! What else can the plant do?",
      license: "CC BY 4.0",
      level: "1",
      pages: 14,
      country: "Nepal",
    });
    expect(entries.map(letsReadCatalogueProblem)).toEqual([
      undefined,
      "license CC BY-NC 4.0",
      // The catalogue does not name publishers: only the book shows that this one is Book Dash's.
      undefined,
      "license Copyright",
    ]);
    expect(cursor).toMatch(/^false:[A-Za-z0-9_-]+$/);
    expect(parseLetsReadCatalogue({})).toEqual({ entries: [], cursor: "" });
  });

  it("knows the publishers that are imported from their own sources, and compares titles loosely", () => {
    expect(letsReadSkippedPublisher("BookDash")).toBe("Book Dash");
    expect(letsReadSkippedPublisher("https://storyweaver.org.in/stories/6818-a-street-or-a-zoo")).toBe("StoryWeaver / Pratham Books");
    expect(letsReadSkippedPublisher("Pratham Books")).toBe("StoryWeaver / Pratham Books");
    expect(letsReadSkippedPublisher("https://www.africanstorybook.org/")).toBe("African Storybook (Saide)");
    expect(letsReadSkippedPublisher("The Asia Foundation - Let's Read")).toBeUndefined();
    expect(letsReadTitleKey("Why Don’t They Sprout?")).toBe(letsReadTitleKey("  why don't they  SPROUT "));
    expect(letsReadTitleKey("Ali’s Little Star")).toBe("alis little star");
    expect(letsReadTitleKey("!?")).toBe("");
  });
});

describe("LetsReadClient", () => {
  it("follows the cursor through the catalogue once, and keeps one entry per book", async () => {
    const first = JSON.parse(CATALOGUE) as { other: unknown[]; cursorWebSafeString: string };
    const second = { featured: [first.other[0]], other: first.other.slice(2), cursorWebSafeString: null };
    const { fetch, calls } = stubFetch({
      [SEARCH]: { body: JSON.stringify({ ...first, other: first.other.slice(0, 2) }) },
      [`${SEARCH}${encodeURIComponent(first.cursorWebSafeString)}`]: { body: JSON.stringify(second) },
    });
    const client = new LetsReadClient({ fetch });
    expect((await client.catalogue()).map((entry) => entry.title)).toEqual(["Nettle Medicine", "The Bell", "Walking Together", "The Girl Who Watches Over Turtles"]);
    await client.catalogue();
    expect(calls).toHaveLength(2);
  });

  it("answers not-found for an unknown book and never asks for an id that is not one", async () => {
    const { fetch, calls } = stubFetch({
      [`${PREVIEW}/${SCHOOL_ID}`]: { status: 404, body: '{"error":{"message":"Book not found."}}' },
      [`${PREVIEW}/${NETTLE_ID}`]: { body: SCHOOL },
      [`${PREVIEW}/31b0f994-74b9-4c9f-bb4d-be128824f638`]: { status: 401, body: "sign in" },
    });
    const client = new LetsReadClient({ fetch });
    await expect(client.book(SCHOOL_ID)).rejects.toMatchObject({ code: "not-found" });
    // A book that needs a signed in reader is left alone.
    await expect(client.book("31b0f994-74b9-4c9f-bb4d-be128824f638")).rejects.toMatchObject({ code: "not-found" });
    // The answer must be the book that was asked for.
    await expect(client.book(NETTLE_ID)).rejects.toMatchObject({ code: "invalid-book" });
    const before = calls.length;
    for (const id of ["../etc", "14051", "the-bell", `${NETTLE_ID}/x`]) await expect(client.book(id)).rejects.toMatchObject({ code: "invalid-id" });
    expect(calls).toHaveLength(before);
  });

  it("takes the attribution page out of the EPUB with two small requests, or out of the whole file", async () => {
    const { fetch, calls } = stubFetch({ [NETTLE_EPUB]: { body: NETTLE_ZIP } });
    const credits = await new LetsReadClient({ fetch }).credits(NETTLE_EPUB);
    expect(credits.statedLicenses).toEqual(["CC BY 4.0"]);
    expect(credits.author).toBe("Buddha Yonjan Lama");
    // The end of the file with its table of contents, then the page itself: not the 150 KB font.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(`${NETTLE_EPUB} [bytes=-65536]`);
    expect(calls[1]).toMatch(/\[bytes=\d+-\d+\]$/);
    const [from, to] = /bytes=(\d+)-(\d+)/.exec(calls[1])!.slice(1).map(Number);
    expect(to - from).toBeLessThan(8000);

    // A small EPUB arrives whole with the first request; so does one from a server that ignores ranges.
    const small = stubFetch({ [NETTLE_EPUB]: { body: await epub(BELL_CREDITS, 1000) } });
    expect((await new LetsReadClient({ fetch: small.fetch }).credits(NETTLE_EPUB)).statedLicenses).toEqual(["CC BY-NC 4.0"]);
    expect(small.calls).toHaveLength(1);
    const whole = stubFetch({ [NETTLE_EPUB]: { body: NETTLE_ZIP, ignoreRange: true } });
    expect((await new LetsReadClient({ fetch: whole.fetch }).credits(NETTLE_EPUB)).statedLicenses).toEqual(["CC BY 4.0"]);
    expect(whole.calls).toHaveLength(1);
  });

  it("refuses an EPUB without an attribution page, a file that is no EPUB and an address outside the bucket", async () => {
    const { fetch, calls } = stubFetch({
      [NETTLE_EPUB]: { body: await epub(null) },
      [`${LETSREAD.mediaBase}lets-read-epubs/broken.epub`]: { body: "<html>not a zip</html>" },
    });
    const client = new LetsReadClient({ fetch });
    await expect(client.credits(NETTLE_EPUB)).rejects.toMatchObject({ code: "license" });
    await expect(client.credits(`${LETSREAD.mediaBase}lets-read-epubs/broken.epub`)).rejects.toMatchObject({ code: "invalid-book" });
    const before = calls.length;
    for (const url of ["https://evil.example/lets-read-epubs/a.epub", `${LETSREAD.mediaBase}pdfs/a.epub`, `${LETSREAD.mediaBase}lets-read-epubs/../../x.epub`]) {
      await expect(client.credits(url)).rejects.toMatchObject({ code: "invalid-book" });
    }
    expect(calls).toHaveLength(before);
  });

  it("downloads pictures only from Let's Read's storage and refuses what is not a picture", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const serving = "https://lh3.googleusercontent.com/LowcRbY7bKP7tt6IF_JSTJH_3Nx4gSr6AHa43a6V6DFWBReTAhitbMg=w1600";
    const { fetch, calls } = stubFetch({
      [`${NETTLE_IMAGES}/p-1.jpg`]: { body: JPEG },
      [serving]: { body: PNG },
      [`${NETTLE_IMAGES}/page.html`]: { body: "<html>not a picture</html>" },
      [`${NETTLE_IMAGES}/logo.svg`]: { body: svg },
      [`${NETTLE_IMAGES}/huge.jpg`]: { body: JPEG, headers: { "content-length": String(500 * 1024 * 1024) } },
    });
    const client = new LetsReadClient({ fetch });
    expect((await client.image(`${NETTLE_IMAGES}/p-1.jpg`)).contentType).toBe("image/jpeg");
    expect((await client.image(serving)).contentType).toBe("image/png");
    for (const file of ["page.html", "logo.svg", "huge.jpg", "missing.jpg"]) {
      await expect(client.image(`${NETTLE_IMAGES}/${file}`)).rejects.toMatchObject({ code: "media" });
    }
    const before = calls.length;
    for (const url of [
      "https://evil.example/a.jpg",
      "https://storage.googleapis.com/another-bucket/a.jpg",
      `${LETSREAD.mediaBase}a/../../secret.jpg`,
      `${NETTLE_IMAGES}/a.jpg?x=1`,
      "https://lh3.googleusercontent.com/short=w1600",
      `${serving}-rw`,
    ]) {
      await expect(client.image(url)).rejects.toMatchObject({ code: "media" });
    }
    expect(calls).toHaveLength(before);
  });
});

describe("importLetsReadBook", () => {
  let data: TempData;
  beforeEach(async () => {
    data = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
  });

  it("creates an English draft with images and the credits of the book's own attribution page", async () => {
    const { fetch, calls } = stubFetch(nettleRoutes());
    const result = await importLetsReadBook({ id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media, client: new LetsReadClient({ fetch }) });
    expect(result.status).toBe("created");
    expect(result.warnings).toEqual(["the record names no illustrator"]);
    const book = result.book;
    expect(book).toMatchObject({
      id: `letsread-${NETTLE_ID}`,
      slug: "letsread-nettle-medicine",
      title: "Nettle Medicine",
      status: "draft",
      origin: "import",
      ownerId: "system",
      language: "en",
      originalLanguage: "en",
      license: "CC BY 4.0",
      source: `https://www.letsreadasia.org/book/${NETTLE_ID}?bookLang=4846240843956224`,
      author: "Buddha Yonjan Lama",
      illustrator: "",
      ageGroup: "3-5",
      coverImage: `books/letsread-${NETTLE_ID}/cover.png`,
    });
    expect(book.credits).toEqual({
      publisher: "The Asia Foundation - Let's Read",
      publisherUrl: "https://www.letsreadasia.org",
      attributionLine: expect.stringContaining("© The Asia Foundation - Let's Read. Released under CC-BY-4.0."),
      originalTitle: "Nettle Medicine",
      editor: "Kumudini Gurung Shrestha",
      creators: "Sushma Maharjan, Kumudini Gurung Shrestha, Srijanalaya",
    });
    expect(book.summary).toContain("Nhorbu and his grandmother pick a plant");
    expect(book.pages).toHaveLength(12);
    expect(book.pages[1]).toEqual({
      index: 1,
      text: "Nhorbu and Maam go look for nettle.",
      originalText: "Nhorbu and Maam go look for nettle.",
      image: `books/letsread-${NETTLE_ID}/page-02.jpg`,
    });
    expect(await data.media.list(`books/letsread-${NETTLE_ID}`)).toHaveLength(13);
    // The book, two requests into the EPUB, 12 pages and the cover: no sponsor or glossary picture is fetched.
    expect(calls).toHaveLength(16);
    expect(calls.slice(3).every((url) => url.startsWith(LETSREAD.mediaBase))).toBe(true);

    expect(await findLetsReadBook(data.repo, NETTLE_ID)).toEqual(book);
    expect(letsReadBookId(NETTLE_ID)).toBe(book.id);
    expect(letsReadSourceUrl(NETTLE_ID)).toBe(book.source);
    expect(publishProblems(book).map((problem) => problem.code)).toContain("language");
  });

  it("is idempotent: a second import changes nothing, force replaces the copy", async () => {
    const { fetch, calls } = stubFetch(nettleRoutes());
    const options = { id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media, client: new LetsReadClient({ fetch }) };
    const first = await importLetsReadBook(options);
    await data.repo.updateBook(first.book.id, { title: "תרופת הסרפד", language: "he" });
    const requests = calls.length;

    const second = await importLetsReadBook(options);
    expect(second.status).toBe("skipped");
    expect(second.book.title).toBe("תרופת הסרפד");
    expect(calls).toHaveLength(requests);

    // The book's own title in the list of known titles does not stand in the way of replacing it.
    const forced = await importLetsReadBook({ ...options, ownerId: "u_other", force: true, knownTitles: await letsReadKnownTitles(data.repo) });
    expect(forced.status).toBe("replaced");
    expect(forced.book).toMatchObject({ title: "Nettle Medicine", language: "en", ownerId: "u_other" });
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(1);

    await data.repo.updateBook(first.book.id, { status: "published", language: "he" });
    await expect(importLetsReadBook({ ...options, force: true })).rejects.toBeInstanceOf(LetsReadError);
  });

  it("refuses every license but CC BY 4.0 and CC0, before any picture is downloaded", async () => {
    const base = { id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media };
    const attempt = async (routes: Record<string, StubResponse>) => {
      const { fetch, calls } = stubFetch(nettleRoutes(routes));
      await expect(importLetsReadBook({ ...base, client: new LetsReadClient({ fetch }) })).rejects.toMatchObject({ code: "license" });
      return calls;
    };
    // The record says CC BY-NC, CC BY 3.0, "Copyright" or nothing: the EPUB is not even opened.
    for (const license of ["CC-BY-NC-4.0", "CC-BY-3.0", "CC-BY-NC-SA-4.0", "Copyright", "", null]) {
      expect(await attempt({ [`${PREVIEW}/${NETTLE_ID}`]: { body: nettleWith({ license }) } })).toHaveLength(1);
    }
    // The record says CC BY 4.0, the book's own attribution page says CC BY-NC 4.0.
    const calls = await attempt({ [NETTLE_EPUB]: { body: BELL_ZIP } });
    expect(calls.filter((url) => !url.startsWith(PREVIEW) && !url.startsWith(NETTLE_EPUB))).toEqual([]);
    // A page that states no license, an older version, all rights reserved; a book without a page or an EPUB.
    const stated = (license: string) => NETTLE_CREDITS.replaceAll("Released under CC-BY-4.0.", license).replaceAll("licenses/by/4.0/", "");
    for (const page of [stated(""), stated("Released under CC-BY-3.0."), stated("All rights reserved.")]) await attempt({ [NETTLE_EPUB]: { body: await epub(page) } });
    await attempt({ [NETTLE_EPUB]: { body: await epub(null) } });
    await attempt({ [`${PREVIEW}/${NETTLE_ID}`]: { body: nettleWith({ epubUrl: null }) } });
    await attempt({ [`${PREVIEW}/${NETTLE_ID}`]: { body: nettleWith({ epubUrl: "https://evil.example/lets-read-epubs/a.epub" }) } });

    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);
    expect(await data.media.list(`books/letsread-${NETTLE_ID}`)).toEqual([]);
  });

  it("stores CC0 only when the record and the attribution page both say so", async () => {
    const page = NETTLE_CREDITS.replaceAll("Released under CC-BY-4.0.", "Released under CC0.").replaceAll("licenses/by/4.0/", "publicdomain/zero/1.0/");
    const routes = { [`${PREVIEW}/${NETTLE_ID}`]: { body: nettleWith({ license: "CC0" }) }, [NETTLE_EPUB]: { body: await epub(page) } };
    const result = await importLetsReadBook({ id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media, client: new LetsReadClient({ fetch: stubFetch(nettleRoutes(routes)).fetch }) });
    expect(result.book.license).toBe("CC0 1.0");
  });

  it("skips the publishers that are imported from their own sources, unless asked", async () => {
    const base = { id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media };
    const client = (routes: Record<string, StubResponse>) => new LetsReadClient({ fetch: stubFetch(nettleRoutes(routes)).fetch });
    // Named by the record, by the address of the original, or only by the attribution page.
    const bookDash = { [`${PREVIEW}/${NETTLE_ID}`]: { body: nettleWith({ collaboratorsByRole: { PUBLISHER: [{ name: "Book Dash" }] } }) } };
    const storyWeaver = { [`${PREVIEW}/${NETTLE_ID}`]: { body: nettleWith({ originalUrl: "https://storyweaver.org.in/stories/6818-a-street-or-a-zoo" }) } };
    const pratham = { [NETTLE_EPUB]: { body: await epub(NETTLE_CREDITS.replaceAll("The Asia Foundation - Let's Read", "Pratham Books")) } };
    for (const routes of [bookDash, storyWeaver, pratham]) {
      await expect(importLetsReadBook({ ...base, client: client(routes) })).rejects.toMatchObject({ code: "publisher" });
    }
    const wanted = await importLetsReadBook({ ...base, client: client(storyWeaver), includeSkippedPublishers: true });
    expect(wanted.status).toBe("created");
    expect(wanted.book.credits?.publisherUrl).toBe("https://storyweaver.org.in/stories/6818-a-street-or-a-zoo");
  });

  it("refuses a book whose title is in the library already under another id", async () => {
    // The same story, imported from the Global Digital Library and translated since.
    await data.repo.createBook({ id: "gdl-14400", title: "תרופת הסרפד", ownerId: "system", credits: { originalTitle: "Nettle  medicine!" } });
    const { fetch, calls } = stubFetch(nettleRoutes());
    const base = { id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media, client: new LetsReadClient({ fetch }) };
    const knownTitles = await letsReadKnownTitles(data.repo);
    expect([...knownTitles.values()]).toEqual(["gdl-14400", "gdl-14400"]);
    await expect(importLetsReadBook({ ...base, knownTitles })).rejects.toMatchObject({ code: "duplicate", message: expect.stringContaining("gdl-14400") });
    expect(calls).toHaveLength(1);
    expect((await importLetsReadBook(base)).status).toBe("created");
  });

  it("stores nothing when an illustration is missing or the pages have no separate text", async () => {
    const routes = nettleRoutes();
    delete routes[`${NETTLE_IMAGES}/p-9.jpg`];
    const base = { id: NETTLE_ID, ownerId: "system", repo: data.repo, media: data.media };
    await expect(importLetsReadBook({ ...base, client: new LetsReadClient({ fetch: stubFetch(routes).fetch }) })).rejects.toMatchObject({ code: "media" });
    expect(await findLetsReadBook(data.repo, NETTLE_ID)).toBeNull();
    expect(await data.media.list(`books/letsread-${NETTLE_ID}`)).toEqual([]);

    // The story text gone from most pages: pictures only, as in a book whose words are painted into them.
    const parsed = JSON.parse(NETTLE) as { pages: { pageNum: number; extractedLongContentValue: string }[] };
    for (const page of parsed.pages) if (page.pageNum > 3 && page.pageNum < 13) page.extractedLongContentValue = "&nbsp;<br/>";
    const { fetch, calls } = stubFetch(nettleRoutes({ [`${PREVIEW}/${NETTLE_ID}`]: { body: JSON.stringify(parsed) } }));
    await expect(importLetsReadBook({ ...base, client: new LetsReadClient({ fetch }) })).rejects.toMatchObject({ code: "no-text" });
    expect(calls.filter((url) => /\.(jpg|png)$/.test(url))).toEqual([]);

    // A cover that cannot be had is not a reason to lose the book: the first page stands in.
    const noCover = nettleRoutes();
    delete noCover[NETTLE_COVER];
    const result = await importLetsReadBook({ ...base, client: new LetsReadClient({ fetch: stubFetch(noCover).fetch }) });
    expect(result.book.coverImage).toBe(`books/letsread-${NETTLE_ID}/page-01.jpg`);
    expect(result.warnings.join(" ")).toMatch(/cover could not be downloaded/);
  });

  it("rejects unknown books and unsafe ids without storing anything", async () => {
    const { fetch, calls } = stubFetch(nettleRoutes());
    const base = { ownerId: "system", repo: data.repo, media: data.media, client: new LetsReadClient({ fetch }) };
    await expect(importLetsReadBook({ ...base, id: "../etc" })).rejects.toMatchObject({ code: "invalid-id" });
    await expect(importLetsReadBook({ ...base, id: NETTLE_ID.toUpperCase() })).rejects.toMatchObject({ code: "invalid-id" });
    expect(calls).toEqual([]);
    await expect(importLetsReadBook({ ...base, id: SCHOOL_ID })).rejects.toMatchObject({ code: "not-found" });
    expect(await findLetsReadBook(data.repo, "../etc")).toBeNull();
    expect(letsReadBookId("../etc")).toBe("letsread-0");
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);
  });
});
