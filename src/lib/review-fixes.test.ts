/**
 * Regression tests for the code-review findings that pure functions can
 * express: the post-login redirect, admin promotion, stale narration, the
 * shared limits, the same-origin check, the rate limiter, SVG uploads and the
 * media URL helpers.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withShareToken } from "@/components/pwa/offline-store";
import { createTempData } from "@/test/temp-data";
import { safeNextPath } from "./auth";
import { exportBookPackage, importBookPackage } from "./book-package";
import { isConfirmedOwnerOfEmail } from "./auth/supabase";
import { timingWordsMatch } from "./hebrew";
import { PagesImportError, PagesImportMetaSchema, createDraftFromPages } from "./importers/create-from-pages";
import { IMPORT_LIMITS, isImageFileName } from "./importers/limits";
import { checkMediaFile, detectImageType, isInertSvg } from "./importers/media-sniff";
import { BOOK_LIMITS } from "./limits";
import { mediaUrl } from "./media/url";
import { BookCapError, assertOwnerCanAddBook } from "./owner-books";
import { PRIVATE_BOOK_FIELDS, toPublicBook, toPublicBookWithPages } from "./public-book";
import {
  RATE_LIMIT_DEFAULTS,
  checkRateLimit,
  clientIp,
  rateLimitRule,
  rateLimited,
  resetRateLimits,
} from "./rate-limit";
import { usableTimings } from "./reader/logic";
import { assertSameOrigin, isSameOriginRequest } from "./same-origin";
import { AUDIO_MAX_BYTES, MAX_PAGES, MAX_PAGE_TEXT, PagesPayloadSchema, narrationStale, publishProblems, sanitizePages } from "./studio/shared";
import type { BookWithPages } from "./types";

const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);
const CARRIAGE_RETURN = String.fromCharCode(13);
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

describe("safeNextPath (open redirect)", () => {
  it("keeps ordinary same-site paths", () => {
    expect(safeNextPath("/studio")).toBe("/studio");
    expect(safeNextPath("/studio/new?x=1&y=2")).toBe("/studio/new?x=1&y=2");
    expect(safeNextPath("/me#favorites")).toBe("/me#favorites");
  });

  it("refuses a path that a browser would turn into another site", () => {
    // Browsers drop tabs and newlines from URLs: "/<TAB>/evil.example" becomes "//evil.example".
    for (const hidden of [TAB, NEWLINE, CARRIAGE_RETURN, " ", NO_BREAK_SPACE]) {
      expect(safeNextPath(`/${hidden}/evil.example`, "/home")).toBe("/home");
      expect(safeNextPath(`/a${hidden}b`, "/home")).toBe("/home");
    }
    expect(safeNextPath("//evil.example", "/home")).toBe("/home");
    expect(safeNextPath("/\\evil.example", "/home")).toBe("/home");
    expect(safeNextPath("\\\\evil.example", "/home")).toBe("/home");
    expect(safeNextPath("https://evil.example", "/home")).toBe("/home");
    expect(safeNextPath("javascript:alert(1)", "/home")).toBe("/home");
    expect(safeNextPath("", "/home")).toBe("/home");
    expect(safeNextPath(null, "/home")).toBe("/home");
  });

  it("never returns something that resolves off-site", () => {
    const candidates = ["/a/../../b", "/./x", "/%2F%2Fevil.example", "/x?next=//evil.example", `/${TAB}${TAB}//evil.example`];
    for (const candidate of candidates) {
      const result = safeNextPath(candidate, "/");
      expect(new URL(result, "https://site.example").origin).toBe("https://site.example");
      expect(result.startsWith("//")).toBe(false);
    }
  });
});

describe("admin promotion needs a confirmed email", () => {
  const sub = "user-1";
  const email = "admin@example.com";

  it("accepts only the auth server's record of this user, this address, confirmed", () => {
    expect(isConfirmedOwnerOfEmail({ id: sub, email, email_confirmed_at: "2026-01-01T00:00:00Z" }, sub, email)).toBe(true);
    expect(isConfirmedOwnerOfEmail({ id: sub, email: "Admin@Example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }, sub, email)).toBe(true);
  });

  it("refuses an unconfirmed address, another user, another address or no record", () => {
    expect(isConfirmedOwnerOfEmail({ id: sub, email }, sub, email)).toBe(false);
    expect(isConfirmedOwnerOfEmail({ id: sub, email, email_confirmed_at: null }, sub, email)).toBe(false);
    expect(isConfirmedOwnerOfEmail({ id: sub, email, email_confirmed_at: "" }, sub, email)).toBe(false);
    expect(isConfirmedOwnerOfEmail({ id: "someone-else", email, email_confirmed_at: "2026-01-01T00:00:00Z" }, sub, email)).toBe(false);
    expect(isConfirmedOwnerOfEmail({ id: sub, email: "other@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }, sub, email)).toBe(false);
    expect(isConfirmedOwnerOfEmail(null, sub, email)).toBe(false);
    expect(isConfirmedOwnerOfEmail(undefined, sub, email)).toBe(false);
  });
});

describe("stale narration is detected by the words, not their number", () => {
  const timings = [
    { word: "דני", start: 0, end: 0.5 },
    { word: "הלך", start: 0.5, end: 1 },
    { word: "לגן", start: 1, end: 1.5 },
  ];
  const narrated = { text: "דני הלך לגן", audio: "books/bk_1/narration-01.wav", wordTimings: timings };

  it("flags an edit that keeps the word count", () => {
    expect(narrationStale(narrated)).toBe(false);
    // One name changed: three words before and after.
    expect(narrationStale({ ...narrated, text: "רוני הלך לגן" })).toBe(true);
    expect(timingWordsMatch(timings, "רוני הלך לגן")).toBe(false);
    expect(timingWordsMatch(timings, "דני הלך לגן")).toBe(true);
  });

  it("accepts timings made from the vocalized text, and notices a changed vocalization", () => {
    const nikudTimings = [
      { word: "דָּנִי", start: 0, end: 0.5 },
      { word: "הָלַךְ", start: 0.5, end: 1 },
      { word: "לַגַּן", start: 1, end: 1.5 },
    ];
    const page = { ...narrated, textNikud: "דָּנִי הָלַךְ לַגַּן", wordTimings: nikudTimings };
    expect(narrationStale(page)).toBe(false);
    expect(usableTimings(page)).toBe(nikudTimings);
    expect(narrationStale({ ...page, textNikud: "דָּנִי הָלְכָה לַגַּן" })).toBe(true);
  });

  it("drops such timings when pages are saved, and keeps matching ones", () => {
    const [kept] = sanitizePages([{ ...narrated }]);
    expect(kept.wordTimings).toEqual(timings);
    const [stale] = sanitizePages([{ ...narrated, text: "רוני הלך לגן" }]);
    expect(stale.audio).toBe(narrated.audio);
    expect(stale.wordTimings).toBeUndefined();
  });

  it("does not highlight words in the reader over audio that says something else", () => {
    expect(usableTimings(narrated)).toBe(timings);
    expect(usableTimings({ ...narrated, text: "רוני הלך לגן" })).toBeNull();
  });

  it("blocks submission until the page is narrated again", () => {
    const book = {
      title: "ספר",
      summary: "תקציר",
      license: "CC BY 4.0",
      author: "מחברת",
      categories: ["animals"],
      pages: [{ index: 0, ...narrated, text: "רוני הלך לגן" }],
    } as Pick<BookWithPages, "title" | "summary" | "license" | "author" | "categories" | "pages">;
    expect(publishProblems(book).map((problem) => problem.code)).toEqual(["narration-stale"]);
    expect(publishProblems({ ...book, pages: [{ index: 0, ...narrated }] })).toEqual([]);
  });
});

describe("one set of limits for the studio and the importers", () => {
  it("uses the same page count and text length everywhere", () => {
    expect(IMPORT_LIMITS.pages).toBe(MAX_PAGES);
    expect(IMPORT_LIMITS.pageTextChars).toBe(MAX_PAGE_TEXT);
    expect(MAX_PAGES).toBe(BOOK_LIMITS.pages);
    expect(MAX_PAGE_TEXT).toBe(BOOK_LIMITS.pageTextChars);
  });

  it("refuses an import that the studio could not save again", () => {
    const meta = (pages: { text: string }[]) => ({ title: "ספר", kind: "images" as const, pages });
    const page = { text: "א" };

    const most = Array.from({ length: MAX_PAGES }, () => page);
    expect(PagesImportMetaSchema.safeParse(meta(most)).success).toBe(true);
    expect(PagesPayloadSchema.safeParse({ pages: most }).success).toBe(true);
    expect(PagesImportMetaSchema.safeParse(meta([...most, page])).success).toBe(false);
    expect(PagesPayloadSchema.safeParse({ pages: [...most, page] }).success).toBe(false);

    const longest = "א".repeat(MAX_PAGE_TEXT);
    expect(PagesImportMetaSchema.safeParse(meta([{ text: longest }])).success).toBe(true);
    expect(PagesImportMetaSchema.safeParse(meta([{ text: `${longest}א` }])).success).toBe(false);
    expect(PagesPayloadSchema.safeParse({ pages: [{ text: `${longest}א` }] }).success).toBe(false);
  });

  it("applies the per-account book cap to imports too, before anything is stored", async () => {
    const full = { listBooks: async () => ({ books: [], total: BOOK_LIMITS.booksPerOwner }) };
    await expect(assertOwnerCanAddBook(full, "u_1")).rejects.toBeInstanceOf(BookCapError);
    await expect(assertOwnerCanAddBook(full, "system")).resolves.toBeUndefined();
    const room = { listBooks: async () => ({ books: [], total: BOOK_LIMITS.booksPerOwner - 1 }) };
    await expect(assertOwnerCanAddBook(room, "u_1")).resolves.toBeUndefined();

    const stored: string[] = [];
    const repo = { ...full, createBook: async () => { throw new Error("must not be reached"); } };
    const media = { put: async (mediaPath: string) => { stored.push(mediaPath); return { path: mediaPath, url: "" }; }, deletePrefix: async () => {} };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    await expect(
      createDraftFromPages({
        ownerId: "u_1",
        meta: PagesImportMetaSchema.parse({ title: "ספר", kind: "images", pages: [{ text: "", hasImage: true }] }),
        images: [png],
        repo: repo as never,
        media: media as never,
      }),
    ).rejects.toBeInstanceOf(BookCapError);
    expect(stored).toEqual([]);
  });

  it("refuses a book package with a page the studio could not save", async () => {
    const data = await createTempData();
    try {
      const longPage = await data.repo.createBook({
        title: "ספר ארוך",
        ownerId: "u_1",
        pages: [{ index: 0, text: "א".repeat(MAX_PAGE_TEXT + 1) }],
      });
      const zip = await exportBookPackage(longPage, { media: data.media });
      await expect(importBookPackage(zip, { ownerId: "u_2", repo: data.repo, media: data.media })).rejects.toMatchObject({
        code: "page-too-long",
      });

      const fits = await data.repo.createBook({
        title: "ספר רגיל",
        ownerId: "u_1",
        pages: [{ index: 0, text: "א".repeat(MAX_PAGE_TEXT) }],
      });
      const imported = await importBookPackage(await exportBookPackage(fits, { media: data.media }), {
        ownerId: "u_2",
        repo: data.repo,
        media: data.media,
      });
      // What was imported can be saved again by the studio schema.
      expect(PagesPayloadSchema.safeParse({ pages: imported.pages.map((page) => ({ text: page.text })) }).success).toBe(true);
    } finally {
      await data.cleanup();
    }
  });

  it("keeps the proxy body limit above the largest upload a route accepts", () => {
    // Next.js cuts a request body off at experimental.proxyClientMaxBodySize (default 10MB) when a proxy runs.
    const config = readFileSync(path.resolve(process.cwd(), "next.config.ts"), "utf8");
    const match = /proxyClientMaxBodySize:\s*"(\d+)mb"/.exec(config);
    expect(match).not.toBeNull();
    const proxyBytes = Number(match![1]) * 1024 * 1024;
    const largestUpload = Math.max(
      IMPORT_LIMITS.pagesRequestBytes,
      IMPORT_LIMITS.packageBytes + 64 * 1024,
      AUDIO_MAX_BYTES + 64 * 1024,
    );
    expect(proxyBytes).toBeGreaterThanOrEqual(largestUpload);
  });
});

describe("same-origin check (one implementation)", () => {
  const request = (headers: Record<string, string>, url = "http://localhost:3000/api/x") =>
    new Request(url, { method: "POST", headers });

  it("allows same-site requests and requests without an Origin", () => {
    expect(isSameOriginRequest(request({}))).toBe(true);
    expect(isSameOriginRequest(request({ origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameOriginRequest(request({ origin: "https://Stories.Example", host: "stories.example" }))).toBe(true);
    // Behind a proxy chain the forwarded host can be a list.
    expect(
      isSameOriginRequest(request({ origin: "https://stories.example", "x-forwarded-host": "internal:8080, stories.example" })),
    ).toBe(true);
  });

  it("refuses other sites, the opaque origin, garbage, and a browser-declared cross-site request", () => {
    expect(isSameOriginRequest(request({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "null" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "not a url" }))).toBe(false);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(() => assertSameOrigin(request({ origin: "https://evil.example" }))).toThrowError(/נחסמה/);
    expect(() => assertSameOrigin(request({ origin: "http://localhost:3000" }))).not.toThrow();
  });
});

describe("rate limiter", () => {
  afterEach(() => resetRateLimits());

  it("allows `limit` requests per window, then refuses until the window moves on", () => {
    const rule = { limit: 3, windowMs: 1000 };
    const start = 1_000_000;
    expect(checkRateLimit("t", "a", rule, start).ok).toBe(true);
    expect(checkRateLimit("t", "a", rule, start + 10).ok).toBe(true);
    expect(checkRateLimit("t", "a", rule, start + 20)).toMatchObject({ ok: true, remaining: 0 });
    const refused = checkRateLimit("t", "a", rule, start + 30);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSeconds).toBe(1);
    // Other callers and other endpoints have their own counters.
    expect(checkRateLimit("t", "b", rule, start + 30).ok).toBe(true);
    expect(checkRateLimit("other", "a", rule, start + 30).ok).toBe(true);
    // A refused request is not counted, so the first slot frees up on time.
    expect(checkRateLimit("t", "a", rule, start + 1001).ok).toBe(true);
    expect(checkRateLimit("t", "a", rule, start + 1002).ok).toBe(false);
  });

  it("reads the limits from the environment", () => {
    expect(rateLimitRule("OCR", {}).limit).toBe(RATE_LIMIT_DEFAULTS.OCR);
    expect(rateLimitRule("OCR", { RATE_LIMIT_OCR_PER_HOUR: "7" }).limit).toBe(7);
    expect(rateLimitRule("OCR", { RATE_LIMIT_OCR_PER_HOUR: "0" }).limit).toBe(0);
    expect(rateLimitRule("OCR", { RATE_LIMIT_OCR_PER_HOUR: "off" }).limit).toBe(Number.POSITIVE_INFINITY);
    expect(rateLimitRule("OCR", { RATE_LIMIT_OCR_PER_HOUR: "lots" }).limit).toBe(RATE_LIMIT_DEFAULTS.OCR);
    expect(rateLimitRule("OCR", { RATE_LIMIT_OCR_PER_HOUR: "-3" }).limit).toBe(RATE_LIMIT_DEFAULTS.OCR);
  });

  it("answers 429 with Retry-After per user, and does not limit staff", async () => {
    const request = new Request("http://localhost/api/x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    expect(clientIp(request)).toBe("203.0.113.9");
    expect(clientIp(new Request("http://localhost/api/x"))).toBe("unknown");
    expect(clientIp(new Request("http://localhost/api/x", { headers: { "x-forwarded-for": "<script>" } }))).toBe("unknown");

    const parent = { id: "u_parent", role: "parent" };
    let last: Response | null = null;
    for (let i = 0; i <= RATE_LIMIT_DEFAULTS.TRANSLATE; i += 1) last = rateLimited("TRANSLATE", { request, user: parent });
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await last!.json()) as { error: string }).error).toContain("יותר מדי בקשות");
    // Another user, and an editor, are not affected.
    expect(rateLimited("TRANSLATE", { request, user: { id: "u_other", role: "parent" } })).toBeNull();
    for (let i = 0; i < RATE_LIMIT_DEFAULTS.TRANSLATE + 5; i += 1) {
      expect(rateLimited("TRANSLATE", { request, user: { id: "u_editor", role: "editor" } })).toBeNull();
    }
  });
});

describe("SVG is not an upload format", () => {
  const svg = (body: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

  it("is refused for pictures a user picks, as in the studio", async () => {
    expect(detectImageType(svg("<rect/>"))).toBe("image/svg+xml");
    expect(detectImageType(svg("<rect/>"), { allowSvg: false })).toBeNull();
    expect(isImageFileName("page.svg")).toBe(false);
    expect(isImageFileName("page.PNG")).toBe(true);
    await expect(
      createDraftFromPages({
        ownerId: "u_1",
        meta: PagesImportMetaSchema.parse({ title: "ספר", kind: "images", pages: [{ text: "", hasImage: true }] }),
        images: [svg("<script>alert(1)</script>")],
        repo: {} as never,
        media: {} as never,
      }),
    ).rejects.toMatchObject({ code: "image-type" } satisfies Partial<PagesImportError>);
  });

  it("is accepted inside a book package only when it cannot run code", () => {
    expect(isInertSvg(svg('<rect width="4" height="3" fill="#fff"/><text>שלום</text>'))).toBe(true);
    expect(checkMediaFile("image", "cover.svg", svg("<rect/>"))).toEqual({ ok: true, contentType: "image/svg+xml" });
    for (const active of [
      "<script>alert(1)</script>",
      '<rect onload="alert(1)"/>',
      '<a href="javascript:alert(1)"><rect/></a>',
      "<foreignObject><iframe/></foreignObject>",
      '<set attributeName="href" to="javascript:alert(1)"/>',
    ]) {
      expect(isInertSvg(svg(active))).toBe(false);
      expect(checkMediaFile("image", "cover.svg", svg(active))).toEqual({ ok: false, reason: "content" });
    }
  });
});

describe("book fields that reach other people's browsers", () => {
  const book = {
    id: "bk_1",
    slug: "a-book",
    title: "ספר",
    ownerId: "u_owner",
    shareToken: "abcdefghijklmnopqrstuvwx",
    reviewNote: "לתקן את עמוד 2",
    costUsd: 0.42,
    status: "published",
    pages: [{ index: 0, text: "עמוד" }],
  } as unknown as BookWithPages;

  it("drops the share token, the owner id, the review note and the cost", () => {
    const projected = toPublicBook(book) as Record<string, unknown>;
    for (const field of PRIVATE_BOOK_FIELDS) expect(projected).not.toHaveProperty(field);
    expect(projected).not.toHaveProperty("pages");
    expect(projected).toMatchObject({ id: "bk_1", slug: "a-book", title: "ספר" });
    const serialised = JSON.stringify(projected);
    expect(serialised).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(serialised).not.toContain("u_owner");

    const withPages = toPublicBookWithPages(book) as Record<string, unknown>;
    for (const field of PRIVATE_BOOK_FIELDS) expect(withPages).not.toHaveProperty(field);
    expect(withPages.pages).toEqual(book.pages);
    // The stored book is not changed.
    expect(book.shareToken).toBe("abcdefghijklmnopqrstuvwx");
  });
});

describe("media URLs", () => {
  it("adds the share token only when one is given", () => {
    expect(mediaUrl("books/bk_1/a.png")).toBe("/media/books/bk_1/a.png");
    expect(mediaUrl("books/bk_1/a.png", "v1")).toBe("/media/books/bk_1/a.png?v=v1");
    expect(mediaUrl("books/bk_1/a.png", "v1", "tok")).toBe("/media/books/bk_1/a.png?v=v1&t=tok");
    expect(mediaUrl("books/bk_1/a.png", undefined, "tok")).toBe("/media/books/bk_1/a.png?t=tok");
    expect(mediaUrl("books/bk_1/a.png", "v1", null)).toBe("/media/books/bk_1/a.png?v=v1");
    expect(mediaUrl("", "v1", "tok")).toBe("");
    expect(mediaUrl("blob:abc", "v1", "tok")).toBe("blob:abc");
  });

  it("lets the offline download send the token without storing it in the address", () => {
    expect(withShareToken("/media/books/bk_1/a.png?v=1", "tok")).toBe("/media/books/bk_1/a.png?v=1&t=tok");
    expect(withShareToken("/media/books/bk_1/a.png", "tok")).toBe("/media/books/bk_1/a.png?t=tok");
    expect(withShareToken("/media/books/bk_1/a.png?v=1", undefined)).toBe("/media/books/bk_1/a.png?v=1");
  });
});

describe("supabase migrations: media buckets", () => {
  it("end private, so storage cannot be read around the /media route", () => {
    const dir = path.resolve(process.cwd(), "supabase/migrations");
    const sql = readFileSync(path.join(dir, "20261013000400_private_media.sql"), "utf8").replace(/--.*$/gm, "");
    expect(sql.replace(/\s+/g, " ")).toMatch(
      /update storage\.buckets set public = false where id in \('book-images', 'book-audio', 'book-files'\)/,
    );
  });
});
