import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { User } from "@/lib/types";

// The session comes from a cookie in production; here the current user is set directly.
let currentUser: User | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...original,
    getCurrentUser: async () => currentUser,
    requireUser: async () => {
      if (!currentUser) throw new original.AuthError(401);
      return currentUser;
    },
  };
});

import * as favoritesRoute from "./route";
import * as favoriteRoute from "./[bookId]/route";
import * as progressRoute from "../progress/route";
import * as shareRoute from "../share/[bookId]/route";
import * as booksRoute from "../../me/books/route";
import * as offlineRoute from "../../offline/book/[bookId]/route";

const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
const other: User = { id: "u_other", name: "אחר", role: "parent" };

const BASE = "http://localhost:3000";

function req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (bookId: string) => ({ params: Promise.resolve({ bookId }) });

let data: TempData;
let publicId: string;
let privateId: string;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  currentUser = null;
  const pages = [
    { index: 0, text: "עמוד אחד", image: "books/x/page-01.svg" },
    { index: 1, text: "עמוד שתיים" },
    { index: 2, text: "עמוד שלוש" },
  ];
  publicId = (await data.repo.createBook({ title: "Public", ownerId: "system", status: "published", pages })).id;
  privateId = (
    await data.repo.createBook({ title: "Private", ownerId: owner.id, status: "private", pages, coverImage: "books/x/cover.svg" })
  ).id;
});

afterEach(async () => {
  await data.cleanup();
});

describe("favorites API", () => {
  it("rejects anonymous callers on every method", async () => {
    expect((await favoritesRoute.GET()).status).toBe(401);
    expect((await favoriteRoute.POST(req(`/api/favorites/${publicId}`, "POST", {}), ctx(publicId))).status).toBe(401);
    expect((await favoriteRoute.DELETE(req(`/api/favorites/${publicId}`, "DELETE"), ctx(publicId))).status).toBe(401);
    expect((await favoritesRoute.POST(req("/api/favorites", "POST", { bookIds: [publicId] }))).status).toBe(401);
  });

  it("adds, lists and removes a favorite", async () => {
    currentUser = other;
    const added = await favoriteRoute.POST(req(`/api/favorites/${publicId}`, "POST", {}), ctx(publicId));
    expect(added.status).toBe(200);
    const list = (await (await favoritesRoute.GET()).json()) as { bookIds: string[]; books: { id: string }[] };
    expect(list.bookIds).toEqual([publicId]);
    expect(list.books[0].id).toBe(publicId);
    expect(list.books[0]).not.toHaveProperty("shareToken");

    expect((await favoriteRoute.DELETE(req(`/api/favorites/${publicId}`, "DELETE"), ctx(publicId))).status).toBe(200);
    expect(await data.repo.isFavorite(other.id, publicId)).toBe(false);
  });

  it("does not let a user favorite a private book of someone else", async () => {
    currentUser = other;
    const res = await favoriteRoute.POST(req(`/api/favorites/${privateId}`, "POST", {}), ctx(privateId));
    expect(res.status).toBe(404);
    expect(await data.repo.isFavorite(other.id, privateId)).toBe(false);
  });

  it("rejects malformed ids and cross-site requests", async () => {
    currentUser = other;
    expect((await favoriteRoute.POST(req("/api/favorites/x", "POST", {}), ctx("../etc"))).status).toBe(400);
    const crossSite = await favoriteRoute.POST(
      req(`/api/favorites/${publicId}`, "POST", {}, { Origin: "https://evil.example" }),
      ctx(publicId),
    );
    expect(crossSite.status).toBe(403);
    const sameSite = await favoriteRoute.POST(
      req(`/api/favorites/${publicId}`, "POST", {}, { Origin: BASE }),
      ctx(publicId),
    );
    expect(sameSite.status).toBe(200);
  });

  it("merges device favorites, skipping books the user may not see", async () => {
    currentUser = other;
    const res = await favoritesRoute.POST(req("/api/favorites", "POST", { bookIds: [publicId, privateId, "missing"] }));
    expect(await res.json()).toEqual({ added: [publicId], skipped: [privateId, "missing"] });
  });
});

describe("progress API", () => {
  it("requires a user", async () => {
    expect((await progressRoute.GET(req("/api/progress"))).status).toBe(401);
    expect((await progressRoute.POST(req("/api/progress", "POST", { bookId: publicId, pageIndex: 1 }))).status).toBe(401);
  });

  it("saves by id or slug, clamps to the last page and keeps 'completed'", async () => {
    currentUser = other;
    const first = await progressRoute.POST(req("/api/progress", "POST", { bookId: publicId, pageIndex: 99, completed: true }));
    expect(((await first.json()) as { progress: { pageIndex: number } }).progress.pageIndex).toBe(2);

    const slug = (await data.repo.getBookById(publicId))!.slug;
    await progressRoute.POST(req("/api/progress", "POST", { slug, pageIndex: 1 }));
    const one = (await (await progressRoute.GET(req(`/api/progress?bookId=${publicId}`))).json()) as {
      progress: { pageIndex: number; completed: boolean };
    };
    expect(one.progress).toMatchObject({ pageIndex: 1, completed: true });

    const all = (await (await progressRoute.GET(req("/api/progress"))).json()) as { progress: unknown[] };
    expect(all.progress).toHaveLength(1);
  });

  it("validates input and hides private books", async () => {
    currentUser = other;
    expect((await progressRoute.POST(req("/api/progress", "POST", { bookId: publicId, pageIndex: -1 }))).status).toBe(400);
    expect((await progressRoute.POST(req("/api/progress", "POST", { pageIndex: 1 }))).status).toBe(400);
    expect((await progressRoute.POST(req("/api/progress", "POST", { bookId: privateId, pageIndex: 1 }))).status).toBe(404);
  });

  it("merge keeps the newer position", async () => {
    currentUser = other;
    await data.repo.setProgress(other.id, publicId, 2);
    const res = await progressRoute.POST(
      req("/api/progress", "POST", {
        items: [
          { bookId: publicId, pageIndex: 0, completed: true, updatedAt: "2000-01-01T00:00:00.000Z" },
          { bookId: privateId, pageIndex: 1, completed: false, updatedAt: new Date().toISOString() },
        ],
      }),
    );
    const body = (await res.json()) as { progress: { pageIndex: number; completed: boolean }[]; skipped: string[] };
    // The account position (page 2) is newer, but "completed" from the device is kept.
    expect(body.progress).toHaveLength(1);
    expect(body.progress[0]).toMatchObject({ pageIndex: 2, completed: true });
    expect(body.skipped).toEqual([privateId]);
  });
});

describe("share API", () => {
  it("is owner only", async () => {
    expect((await shareRoute.POST(req(`/api/share/${privateId}`, "POST", {}), ctx(privateId))).status).toBe(401);
    currentUser = other;
    expect((await shareRoute.POST(req(`/api/share/${privateId}`, "POST", {}), ctx(privateId))).status).toBe(404);
    expect((await shareRoute.DELETE(req(`/api/share/${privateId}`, "DELETE"), ctx(privateId))).status).toBe(404);
    expect((await shareRoute.GET(req(`/api/share/${privateId}`), ctx(privateId))).status).toBe(404);
    // Even an editor who is not the owner cannot create a link.
    currentUser = { ...other, role: "admin" };
    expect((await shareRoute.POST(req(`/api/share/${privateId}`, "POST", {}), ctx(privateId))).status).toBe(404);
    expect((await data.repo.getBookById(privateId))!.shareToken).toBeUndefined();
  });

  it("creates, reuses, rotates and revokes a token", async () => {
    currentUser = owner;
    const created = (await (await shareRoute.POST(req(`/api/share/${privateId}`, "POST", {}), ctx(privateId))).json()) as {
      token: string;
      url: string;
      path: string;
    };
    expect(created.token).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(created.path).toBe(`/share/${created.token}`);
    expect(created.url).toBe(`${BASE}/share/${created.token}`);
    expect((await data.repo.getBookByShareToken(created.token))!.id).toBe(privateId);

    const again = (await (await shareRoute.POST(req(`/api/share/${privateId}`, "POST", {}), ctx(privateId))).json()) as {
      token: string;
    };
    expect(again.token).toBe(created.token);

    const rotated = (await (
      await shareRoute.POST(req(`/api/share/${privateId}`, "POST", { rotate: true }), ctx(privateId))
    ).json()) as { token: string };
    expect(rotated.token).not.toBe(created.token);
    expect(await data.repo.getBookByShareToken(created.token)).toBeNull();

    const revoked = await shareRoute.DELETE(req(`/api/share/${privateId}`, "DELETE"), ctx(privateId));
    expect(((await revoked.json()) as { token: null }).token).toBeNull();
    expect((await data.repo.getBookById(privateId))!.shareToken).toBeUndefined();
    expect(await data.repo.getBookByShareToken(rotated.token)).toBeNull();
  });
});

describe("book lookups for the device", () => {
  it("/me/books returns only viewable books, in the requested order", async () => {
    const res = await booksRoute.GET(req(`/me/books?ids=${privateId},${publicId}`));
    expect(((await res.json()) as { books: { id: string }[] }).books.map((b) => b.id)).toEqual([publicId]);
    currentUser = owner;
    const mine = await booksRoute.GET(req(`/me/books?ids=${privateId},${publicId}`));
    expect(((await mine.json()) as { books: { id: string }[] }).books.map((b) => b.id)).toEqual([privateId, publicId]);
    expect((await booksRoute.GET(req("/me/books?ids=../x"))).status).toBe(400);
  });

  it("/offline/book needs view access or the share token", async () => {
    expect((await offlineRoute.GET(req(`/offline/book/${privateId}`), ctx(privateId))).status).toBe(404);
    await data.repo.updateBook(privateId, { shareToken: "abcdefghijklmnopqrstuvwx" });
    expect(
      (await offlineRoute.GET(req(`/offline/book/${privateId}?token=wrongwrongwrongwrongwron`), ctx(privateId))).status,
    ).toBe(404);
    const ok = await offlineRoute.GET(req(`/offline/book/${privateId}?token=abcdefghijklmnopqrstuvwx`), ctx(privateId));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { isPublic: boolean; pages: { image?: string }[]; assets: string[]; cover: string };
    expect(body.isPublic).toBe(false);
    expect(body.pages).toHaveLength(3);
    expect(body.cover).toMatch(/^\/media\/books\/x\/cover\.svg\?v=/);
    expect(body.assets).toEqual([body.cover, body.pages[0].image]);
    expect(JSON.stringify(body)).not.toContain("abcdefghijklmnopqrstuvwx");

    const pub = (await (await offlineRoute.GET(req(`/offline/book/${publicId}`), ctx(publicId))).json()) as {
      isPublic: boolean;
    };
    expect(pub.isPublic).toBe(true);
  });
});
