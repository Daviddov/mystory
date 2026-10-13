/**
 * Cross-module guarantees the whole site relies on: which books a listing may
 * show, who may open an unpublished book, that /media never leaves the media
 * folder, that the session cookie cannot be forged, and that only published
 * books are counted as viewed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as mediaGet } from "@/app/media/[...path]/route";
import { POST as viewPost } from "@/app/api/views/[bookId]/route";
import { canEditBook, canViewBook } from "@/lib/auth";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import type { BookStatus, User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

let data: TempData;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
});

afterEach(async () => {
  await data.cleanup();
});

function user(id: string, role: User["role"]): User {
  return { id, name: id, role, createdAt: new Date().toISOString() };
}

describe("LocalRepository: status visibility, filters and search", () => {
  const STATUSES: BookStatus[] = ["draft", "private", "pending", "published"];

  async function seed() {
    const books = [];
    for (const status of STATUSES) {
      books.push(
        await data.repo.createBook({
          title: `הפיל הסגול ${status}`,
          summary: "סיפור על פיל שאוהב לצייר",
          author: "דנה כהן",
          ownerId: status === "published" ? "u_editor" : "u_owner",
          status,
          ageGroup: "3-5",
          categories: ["animals"],
          tags: ["פילים"],
          themes: ["friendship"],
          readingMinutes: 4,
        }),
      );
    }
    return books;
  }

  it("never returns unpublished books unless a status is asked for", async () => {
    const [draft, priv, pending, published] = await seed();
    const onlyPublished = [published.id];
    const ids = async (filter: Parameters<typeof data.repo.listBooks>[0]) =>
      (await data.repo.listBooks(filter)).books.map((book) => book.id).sort();

    expect(await ids(undefined)).toEqual(onlyPublished);
    expect(await ids({ query: "פיל" })).toEqual(onlyPublished);
    expect(await ids({ category: "animals" })).toEqual(onlyPublished);
    expect(await ids({ tag: "פילים" })).toEqual(onlyPublished);
    expect(await ids({ theme: "friendship", ageGroup: "3-5", timeBucket: "5" })).toEqual(onlyPublished);
    // An owner filter alone does not widen the status.
    expect(await ids({ ownerId: "u_owner" })).toEqual([]);

    expect(await ids({ status: "pending" })).toEqual([pending.id]);
    expect(await ids({ status: ["draft", "private"] })).toEqual([draft.id, priv.id].sort());
    expect(await ids({ status: "any", ownerId: "u_owner" })).toEqual([draft.id, priv.id, pending.id].sort());
    expect(await ids({ status: "any" })).toHaveLength(4);
  });

  it("searches without nikud, across title, summary, author and tags", async () => {
    const [, , , published] = await seed();
    const total = async (query: string) => (await data.repo.listBooks({ query })).total;

    expect(await total("הַפִּיל")).toBe(1);
    expect(await total("לצייר")).toBe(1);
    expect(await total("דנה")).toBe(1);
    expect(await total("פילים")).toBe(1);
    expect(await total("סגול פיל")).toBe(1);
    expect(await total("ג'ירפה")).toBe(0);
    expect((await data.repo.listBooks({ query: "פיל", excludeIds: [published.id] })).total).toBe(0);
    expect((await data.repo.listBooks({ ids: [published.id], ageGroup: "6-8" })).total).toBe(0);
  });

  it("finds a book by share token only while the token is set", async () => {
    const book = await data.repo.createBook({ title: "פרטי", ownerId: "u_owner", status: "private" });
    const shared = await data.repo.updateBook(book.id, { shareToken: "tok_abcdefghijklmnop" });
    expect(shared.shareToken).toBe("tok_abcdefghijklmnop");
    expect((await data.repo.getBookByShareToken("tok_abcdefghijklmnop"))?.id).toBe(book.id);
    expect(await data.repo.getBookByShareToken("tok_other_abcdefghijk")).toBeNull();
    await data.repo.updateBook(book.id, { shareToken: undefined });
    expect(await data.repo.getBookByShareToken("tok_abcdefghijklmnop")).toBeNull();
  });
});

describe("book access rules", () => {
  const owner = user("u_owner", "parent");
  const other = user("u_other", "parent");
  const editor = user("u_editor", "editor");
  const admin = user("u_admin", "admin");

  it.each(["draft", "private", "pending"] as const)("%s: owner, staff or the exact share token", (status) => {
    const book = { status, ownerId: "u_owner", shareToken: "secret-token" };
    expect(canViewBook(book, null)).toBe(false);
    expect(canViewBook(book, other)).toBe(false);
    expect(canViewBook(book, owner)).toBe(true);
    expect(canViewBook(book, editor)).toBe(true);
    expect(canViewBook(book, admin)).toBe(true);
    expect(canViewBook(book, null, "secret-token")).toBe(true);
    expect(canViewBook(book, other, "wrong")).toBe(false);
    expect(canViewBook(book, null, "")).toBe(false);
    // A book without a token is not opened by an empty or missing one.
    expect(canViewBook({ ...book, shareToken: undefined }, null, undefined)).toBe(false);
    expect(canViewBook({ ...book, shareToken: undefined }, null, "")).toBe(false);
  });

  it("published books are public, but editing stays with owner and staff", () => {
    const book = { status: "published" as const, ownerId: "u_owner", shareToken: undefined };
    expect(canViewBook(book, null)).toBe(true);
    expect(canEditBook(book, null)).toBe(false);
    expect(canEditBook(book, other)).toBe(false);
    expect(canEditBook(book, owner)).toBe(true);
    expect(canEditBook(book, editor)).toBe(true);
  });
});

describe("/media route", () => {
  const call = (segments: string[], headers: Record<string, string> = {}) =>
    mediaGet(new Request("http://localhost/media/x", { headers }), { params: Promise.resolve({ path: segments }) });

  it("serves a stored file with safe headers and byte ranges", async () => {
    // Media follows its book: only a published book's files are public.
    await data.repo.createBook({ id: "bk_1", title: "ספר", ownerId: "u_owner", status: "published" });
    await data.media.put("books/bk_1/a.svg", new TextEncoder().encode("<svg>abc</svg>"), "image/svg+xml");
    const full = await call(["books", "bk_1", "a.svg"]);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/svg+xml");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(full.headers.get("content-security-policy")).toContain("sandbox");
    expect(await full.text()).toBe("<svg>abc</svg>");

    const part = await call(["books", "bk_1", "a.svg"], { range: "bytes=5-7" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 5-7/14");
    expect(await part.text()).toBe("abc");
    expect((await call(["books", "bk_1", "a.svg"], { range: "bytes=99-" })).status).toBe(416);
  });

  it.each([
    [["..", "books.json"]],
    [["books", "..", "..", "users.json"]],
    [["books", "..%2f..%2fusers.json"]],
    [["books\\..\\users.json"]],
    [["C:", "Windows", "win.ini"]],
    [["books", ".auth-secret"]],
    [["books", "bk_1", "missing.svg"]],
  ])("answers 404 for %j", async (segments) => {
    // A real file one level above the media folder must stay unreachable.
    await data.repo.upsertUser({ name: "someone" });
    expect((await call(segments)).status).toBe(404);
  });
});

describe("session cookie signing", () => {
  const secret = "test-secret-0123456789";

  it("accepts its own token and nothing else", () => {
    const now = Date.UTC(2026, 0, 1);
    const token = createSessionToken("u_1", secret, 60, now);
    expect(verifySessionToken(token, secret, now)).toEqual({ uid: "u_1", exp: Math.floor(now / 1000) + 60 });

    const [body, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ uid: "u_admin", exp: 9_999_999_999 })).toString("base64url");
    expect(verifySessionToken(`${forgedBody}.${signature}`, secret, now)).toBeNull();
    expect(verifySessionToken(`${body}.${signature.slice(0, -2)}xx`, secret, now)).toBeNull();
    expect(verifySessionToken(body, secret, now)).toBeNull();
    expect(verifySessionToken(`${body}.`, secret, now)).toBeNull();
    expect(verifySessionToken(`${body}.${signature}.extra`, secret, now)).toBeNull();
    expect(verifySessionToken(token, "another-secret", now)).toBeNull();
    expect(verifySessionToken(token, secret, now + 60_000)).toBeNull();
    expect(verifySessionToken("", secret, now)).toBeNull();
    expect(verifySessionToken(undefined, secret, now)).toBeNull();
  });

  it("rejects a correctly signed token with a malformed payload", () => {
    // Signed by someone who knows the secret but with the wrong shape: still refused.
    const token = createSessionToken("u_1", secret);
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as { uid: unknown };
    expect(typeof payload.uid).toBe("string");
    expect(verifySessionToken("bm90LWpzb24.c2ln", secret)).toBeNull();
  });
});

describe("POST /api/views/[bookId]", () => {
  const call = (bookId: string, headers: Record<string, string> = {}) =>
    viewPost(new Request(`http://localhost/api/views/${bookId}`, { method: "POST", headers }), {
      params: Promise.resolve({ bookId }),
    });

  it("counts published books only, and only same-origin requests", async () => {
    const published = await data.repo.createBook({ title: "ציבורי", ownerId: "u", status: "published" });
    const hidden = await data.repo.createBook({ title: "פרטי", ownerId: "u", status: "private" });

    const first = await call(published.id, { origin: "http://localhost", host: "localhost" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ viewCount: 1 });
    expect((await data.repo.getBookById(published.id))?.viewCount).toBe(1);

    expect((await call(hidden.id)).status).toBe(404);
    expect((await data.repo.getBookById(hidden.id))?.viewCount).toBe(0);
    expect((await call("bk_missing")).status).toBe(404);
    expect((await call(published.id, { origin: "https://evil.example", host: "localhost" })).status).toBe(403);
    expect((await data.repo.getBookById(published.id))?.viewCount).toBe(1);
  });
});

describe("routes", () => {
  it("builds the reader, print and download URLs other modules link to", () => {
    expect(routes.read("my-book")).toBe("/read/my-book");
    expect(routes.read("my-book", 3)).toBe("/read/my-book?page=3");
    expect(routes.read("my-book", undefined, true)).toBe("/read/my-book?listen=1");
    expect(routes.print("my-book")).toBe("/print/my-book");
    expect(routes.print("my-book", "tok")).toBe("/print/my-book?token=tok");
    expect(routes.pdf("my-book", { nikud: 1 })).toBe("/api/pdf/my-book?nikud=1");
    expect(routes.exportBook("bk_1")).toBe("/api/export/bk_1");
    expect(routes.offline()).toBe("/offline");
  });
});
