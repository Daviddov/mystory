/**
 * Regression tests for two review findings:
 *  - media of private, draft and pending books was served to anyone who knew
 *    the path, with a public cache header;
 *  - the reader sent other books' share tokens (and owner ids) to every
 *    visitor inside the recommendations.
 * The /media route and the reader helpers run against a temp data directory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { BookStatus, User } from "../types";

const session = vi.hoisted(() => ({ user: null as User | null }));

// The real local auth reads the request cookie; tests set the visitor directly.
vi.mock("@/lib/auth/local", () => ({
  createLocalAuth: () => ({
    kind: "local",
    getCurrentUser: async () => session.user,
    signOut: async () => {},
  }),
  isLocalLoginAllowed: () => true,
  signInLocal: async () => {
    throw new Error("not used in tests");
  },
}));

import { GET as mediaGet, HEAD as mediaHead } from "@/app/media/[...path]/route";
import { POST as viewPost } from "@/app/api/views/[bookId]/route";
import { recommendBooks } from "../reader/access";
import { resetRateLimits } from "../rate-limit";
import { bookAccessLoader, decideMediaAccess, mediaBookId, MEDIA_ACCESS_CACHE_MS } from "./access";

const owner: User = { id: "u_owner", name: "אמא", role: "parent" };
const stranger: User = { id: "u_other", name: "אורח", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };
const TOKEN = "abcdefghijklmnopqrstuvwx";
const SVG = new TextEncoder().encode("<svg>private picture</svg>");

let data: TempData;

beforeEach(async () => {
  session.user = null;
  resetRateLimits();
  data = await createTempData({ setEnv: true });
});
afterEach(async () => {
  await data.cleanup();
});

async function bookWithPicture(id: string, status: BookStatus, shareToken?: string) {
  const book = await data.repo.createBook({
    id,
    title: `ספר ${id}`,
    ownerId: owner.id,
    status,
    ...(shareToken ? { shareToken } : {}),
    coverImage: `books/${id}/cover.svg`,
  });
  await data.media.put(`books/${id}/cover.svg`, SVG, "image/svg+xml");
  return book;
}

function get(mediaPath: string, query = "", headers: Record<string, string> = {}) {
  return mediaGet(new Request(`http://localhost/media/${mediaPath}${query}`, { headers }), {
    params: Promise.resolve({ path: mediaPath.split("/") }),
  });
}

describe("decideMediaAccess", () => {
  const input = (
    book: { status: BookStatus; ownerId: string; shareToken?: string } | null,
    user: User | null,
    token?: string,
    mediaPath = "books/bk_1/cover.png",
  ) => ({ mediaPath, token, getBook: async () => book, getUser: async () => user });

  it("treats files outside books/ as public site content, without looking anything up", async () => {
    const never = async () => {
      throw new Error("must not be called");
    };
    expect(await decideMediaAccess({ mediaPath: "seed-boots/cover.svg", getBook: never, getUser: never })).toBe("public");
    expect(mediaBookId("seed-boots/cover.svg")).toBeNull();
    expect(mediaBookId("books/bk_1/cover.svg")).toBe("bk_1");
    expect(mediaBookId("books/stray.svg")).toBeNull();
  });

  it("makes a published book's media public without asking who the visitor is", async () => {
    const getUser = vi.fn(async () => null);
    const published = { status: "published" as const, ownerId: owner.id };
    expect(await decideMediaAccess({ ...input(published, null), getUser })).toBe("public");
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each(["draft", "private", "pending"] as const)("%s: only the owner, staff or the exact share token", async (status) => {
    const book = { status, ownerId: owner.id, shareToken: TOKEN };
    expect(await decideMediaAccess(input(book, null))).toBe("denied");
    expect(await decideMediaAccess(input(book, stranger))).toBe("denied");
    expect(await decideMediaAccess(input(book, owner))).toBe("private");
    expect(await decideMediaAccess(input(book, editor))).toBe("private");
    expect(await decideMediaAccess(input(book, null, TOKEN))).toBe("private");
    expect(await decideMediaAccess(input(book, null, `${TOKEN}x`))).toBe("denied");
    expect(await decideMediaAccess(input(book, null, ""))).toBe("denied");
    // A book without a share link is not opened by any token, and a revoked token stops working.
    expect(await decideMediaAccess(input({ status, ownerId: owner.id }, null, TOKEN))).toBe("denied");
    expect(await decideMediaAccess(input({ status, ownerId: owner.id, shareToken: "another-token-1234567890" }, null, TOKEN))).toBe("denied");
  });

  it("keeps files of a book that does not exist (yet) to the staff", async () => {
    expect(await decideMediaAccess(input(null, null))).toBe("denied");
    expect(await decideMediaAccess(input(null, owner))).toBe("denied");
    expect(await decideMediaAccess(input(null, editor))).toBe("private");
    expect(await decideMediaAccess(input(null, null, TOKEN))).toBe("denied");
  });

  it("caches book lookups briefly in Supabase mode only", async () => {
    let status: BookStatus = "published";
    const calls: string[] = [];
    const repo = (kind: "local" | "supabase") => ({
      kind,
      getBookById: async (id: string) => {
        calls.push(id);
        return { status, ownerId: owner.id, shareToken: undefined } as never;
      },
    });
    let clock = 1000;
    const cached = bookAccessLoader(repo("supabase"), () => clock);
    expect((await cached("bk_cache_test"))?.status).toBe("published");
    status = "private";
    expect((await cached("bk_cache_test"))?.status).toBe("published");
    expect(calls).toHaveLength(1);
    clock += MEDIA_ACCESS_CACHE_MS + 1;
    expect((await cached("bk_cache_test"))?.status).toBe("private");

    const direct = bookAccessLoader(repo("local"));
    status = "published";
    expect((await direct("bk_cache_test"))?.status).toBe("published");
    status = "private";
    expect((await direct("bk_cache_test"))?.status).toBe("private");
  });
});

describe("GET /media for a book that is not published", () => {
  it.each(["draft", "private", "pending"] as const)("%s: 404 for strangers, private and uncached for those allowed", async (status) => {
    await bookWithPicture("bk_private", status, TOKEN);
    const file = "books/bk_private/cover.svg";

    // Knowing the path is not enough.
    const anonymous = await get(file);
    expect(anonymous.status).toBe(404);
    expect(await anonymous.text()).not.toContain("private picture");
    session.user = stranger;
    expect((await get(file)).status).toBe(404);
    expect((await get(file, "?t=wrong-token-wrong-token-1")).status).toBe(404);

    for (const [user, query] of [
      [owner, ""],
      [editor, ""],
      [null, `?v=1&t=${TOKEN}`],
    ] as const) {
      session.user = user;
      const response = await get(file, query);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("etag")).toBeNull();
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await response.text()).toBe("<svg>private picture</svg>");
    }

    // Audio seeking (byte ranges) still works for a visitor with the share token.
    session.user = null;
    const part = await get(file, `?t=${TOKEN}`, { range: "bytes=5-11" });
    expect(part.status).toBe(206);
    expect(part.headers.get("cache-control")).toBe("private, no-store");
    expect(await part.text()).toBe("private");
    const head = await mediaHead(new Request(`http://localhost/media/${file}`), { params: Promise.resolve({ path: file.split("/") }) });
    expect(head.status).toBe(404);
  });

  it("stops serving the files when the share link is revoked", async () => {
    const book = await bookWithPicture("bk_shared", "private", TOKEN);
    const file = "books/bk_shared/cover.svg";
    expect((await get(file, `?t=${TOKEN}`)).status).toBe(200);
    await data.repo.updateBook(book.id, { shareToken: undefined });
    expect((await get(file, `?t=${TOKEN}`)).status).toBe(404);
  });

  it("serves a published book's files to anyone, cacheable, and hides them again when it is unpublished", async () => {
    const book = await bookWithPicture("bk_public", "published");
    const file = "books/bk_public/cover.svg";
    const response = await get(file);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const etag = response.headers.get("etag");
    expect(etag).toBeTruthy();
    expect((await get(file, "", { "if-none-match": etag! })).status).toBe(304);
    // A versioned address (mediaUrl with updatedAt) may be kept for a week.
    expect((await get(file, "?v=1")).headers.get("cache-control")).toContain("max-age=604800");

    await data.repo.updateBook(book.id, { status: "private" });
    expect((await get(file)).status).toBe(404);
    // A validator from the public days must not confirm the file to a stranger.
    expect((await get(file, "", { "if-none-match": etag! })).status).toBe(404);
  });

  it("keeps the seeded library (files outside books/) public", async () => {
    await data.media.put("seed-boots/cover.svg", SVG, "image/svg+xml");
    const response = await get("seed-boots/cover.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
  });
});

describe("recommendations sent to the reader", () => {
  it("carry no share token, owner id, review note or cost of other people's books", async () => {
    const current = await data.repo.createBook({ title: "הספר הנוכחי", ownerId: owner.id, status: "published", ageGroup: "3-5" });
    for (const n of [1, 2, 3, 4, 5]) {
      await data.repo.createBook({
        title: `ספר מומלץ ${n}`,
        ownerId: `u_author_${n}`,
        status: "published",
        ageGroup: n % 2 ? "3-5" : "6-8",
        shareToken: `sharetoken${n}abcdefghijklmnop`,
        reviewNote: `הערת עורך ${n}`,
        costUsd: n,
      });
    }

    const recommendations = await recommendBooks(current);
    expect(recommendations.length).toBe(4);
    for (const book of recommendations as Record<string, unknown>[]) {
      expect(book).not.toHaveProperty("shareToken");
      expect(book).not.toHaveProperty("ownerId");
      expect(book).not.toHaveProperty("reviewNote");
      expect(book).not.toHaveProperty("costUsd");
      expect(book.title).toMatch(/^ספר מומלץ/);
    }
    // This is what ends up in the page HTML as props of the client-side reader.
    const serialised = JSON.stringify(recommendations);
    expect(serialised).not.toContain("sharetoken");
    expect(serialised).not.toContain("u_author_");
    expect(serialised).not.toContain("הערת עורך");
  });
});

describe("POST /api/views", () => {
  const view = (bookId: string, ip?: string) =>
    viewPost(
      new Request(`http://localhost/api/views/${bookId}`, { method: "POST", headers: ip ? { "x-forwarded-for": ip } : {} }),
      { params: Promise.resolve({ bookId }) },
    );
  const count = async (response: Response) => ((await response.json()) as { viewCount: number }).viewCount;

  it("counts one address once per book, so a loop cannot inflate a book's popularity", async () => {
    const book = await data.repo.createBook({ title: "ספר", ownerId: owner.id, status: "published" });
    const other = await data.repo.createBook({ title: "ספר אחר", ownerId: owner.id, status: "published" });

    expect(await count(await view(book.id, "203.0.113.5"))).toBe(1);
    for (let i = 0; i < 20; i += 1) expect(await count(await view(book.id, "203.0.113.5"))).toBe(1);
    // Another reader, and another book, still count.
    expect(await count(await view(book.id, "203.0.113.6"))).toBe(2);
    expect(await count(await view(other.id, "203.0.113.5"))).toBe(1);
    expect((await data.repo.getBookById(book.id))!.viewCount).toBe(2);
  });

  it("answers 429 once an address used up its hourly budget", async () => {
    vi.stubEnv("RATE_LIMIT_VIEWS_PER_HOUR", "3");
    try {
      const book = await data.repo.createBook({ title: "ספר", ownerId: owner.id, status: "published" });
      for (let i = 0; i < 3; i += 1) expect((await view(book.id, "198.51.100.7")).status).toBe(200);
      const limited = await view(book.id, "198.51.100.7");
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBeTruthy();
      expect((await view(book.id, "198.51.100.8")).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
