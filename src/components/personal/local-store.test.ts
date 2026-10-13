// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAVORITES_KEY,
  OWNER_KEY,
  PENDING_KEY,
  PROGRESS_KEY,
  applyProgress,
  compactPending,
  getSnapshot,
  normalizeFavorites,
  normalizeProgress,
  resetPersonalStoreForTests,
  saveProgress,
  setFavorite,
  syncPersonal,
  toggleFavorite,
  type LocalProgress,
} from "./local-store";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** A tiny fake of the account API. */
function fakeServer(options: { signedIn: boolean; offline?: boolean }) {
  const state = {
    favorites: [] as { bookId: string; createdAt: string }[],
    progress: [] as LocalProgress[],
    calls: [] as Call[],
    ...options,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      state.calls.push({ url, method, body });
      if (state.offline) throw new TypeError("network");
      if (!state.signedIn) return json({ error: "401" }, 401);

      if (url === "/api/favorites" && method === "GET") return json({ favorites: state.favorites });
      if (url === "/api/favorites" && method === "POST") {
        for (const bookId of (body as { bookIds: string[] }).bookIds) {
          if (!state.favorites.some((f) => f.bookId === bookId)) {
            state.favorites.push({ bookId, createdAt: new Date().toISOString() });
          }
        }
        return json({});
      }
      if (url.startsWith("/api/favorites/")) {
        const bookId = url.split("/").pop()!;
        state.favorites = state.favorites.filter((f) => f.bookId !== bookId);
        if (method === "POST") state.favorites.push({ bookId, createdAt: new Date().toISOString() });
        return json({});
      }
      if (url === "/api/progress" && method === "GET") return json({ progress: state.progress });
      if (url === "/api/progress" && method === "POST") {
        const items = (body as { items?: LocalProgress[] }).items ?? [body as LocalProgress];
        for (const item of items) {
          state.progress = state.progress.filter((p) => p.bookId !== item.bookId);
          state.progress.push({
            bookId: item.bookId,
            pageIndex: item.pageIndex,
            completed: !!item.completed,
            updatedAt: item.updatedAt ?? new Date().toISOString(),
          });
        }
        return json({});
      }
      return json({ error: "not found" }, 404);
    }),
  );
  return state;
}

beforeEach(() => {
  localStorage.clear();
  resetPersonalStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pure helpers", () => {
  it("normalizes favorites and progress: newest first, one per book", () => {
    expect(
      normalizeFavorites([
        { bookId: "a", createdAt: "2026-01-01" },
        { bookId: "b", createdAt: "2026-03-01" },
        { bookId: "a", createdAt: "2026-02-01" },
      ]),
    ).toEqual([
      { bookId: "b", createdAt: "2026-03-01" },
      { bookId: "a", createdAt: "2026-02-01" },
    ]);
    expect(
      normalizeProgress([
        { bookId: "a", pageIndex: 1, completed: false, updatedAt: "2026-01-01" },
        { bookId: "a", pageIndex: 4, completed: false, updatedAt: "2026-02-01" },
      ]),
    ).toEqual([{ bookId: "a", pageIndex: 4, completed: false, updatedAt: "2026-02-01" }]);
  });

  it("keeps 'completed' unless it is passed explicitly", () => {
    const done = applyProgress([], "a", 5, true, "t1");
    expect(applyProgress(done, "a", 0, undefined, "t2")[0]).toEqual({
      bookId: "a",
      pageIndex: 0,
      completed: true,
      updatedAt: "t2",
    });
    expect(applyProgress(done, "a", 0, false, "t2")[0].completed).toBe(false);
  });

  it("compacts the pending queue to the last operation per book", () => {
    expect(
      compactPending([
        { type: "favorite", bookId: "a", on: true },
        { type: "favorite", bookId: "b", on: true },
        { type: "favorite", bookId: "a", on: false },
      ]),
    ).toEqual([
      { type: "favorite", bookId: "b", on: true },
      { type: "favorite", bookId: "a", on: false },
    ]);
  });
});

describe("anonymous visitor", () => {
  it("keeps favorites and progress on the device without calling the server", () => {
    const server = fakeServer({ signedIn: false });
    expect(toggleFavorite("bk_1")).toBe(true);
    saveProgress("bk_1", 3);
    expect(getSnapshot().favorites.map((f) => f.bookId)).toEqual(["bk_1"]);
    expect(getSnapshot().progress[0]).toMatchObject({ bookId: "bk_1", pageIndex: 3, completed: false });
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!)).toHaveLength(1);
    expect(server.calls).toEqual([]);
  });

  it("ignores corrupt storage and invalid ids", () => {
    fakeServer({ signedIn: false });
    localStorage.setItem(FAVORITES_KEY, "{not json");
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([{ bookId: "../x", pageIndex: 1 }, 7, null]));
    expect(getSnapshot().favorites).toEqual([]);
    expect(getSnapshot().progress).toEqual([]);
    setFavorite("not a valid id!", true);
    expect(getSnapshot().favorites).toEqual([]);
  });
});

describe("positions saved by the reader", () => {
  const readerKey = (bookId: string) => `mystory:progress:${bookId}`;

  it("are shown as device progress and merged into the account at sign-in", async () => {
    const server = fakeServer({ signedIn: true });
    localStorage.setItem(
      readerKey("bk_read"),
      JSON.stringify({ pageIndex: 4, completed: false, updatedAt: "2026-05-01T10:00:00.000Z" }),
    );
    localStorage.setItem(readerKey("bk_bad"), "{oops");
    expect(getSnapshot().progress).toEqual([
      { bookId: "bk_read", pageIndex: 4, completed: false, updatedAt: "2026-05-01T10:00:00.000Z" },
    ]);

    await syncPersonal("u_1");
    expect(server.progress.map((p) => [p.bookId, p.pageIndex])).toEqual([["bk_read", 4]]);
  });

  it("are sent again only when newer than what the account already gave us", async () => {
    const server = fakeServer({ signedIn: true });
    server.progress.push({ bookId: "bk_read", pageIndex: 1, completed: false, updatedAt: "2026-05-02T00:00:00.000Z" });
    await syncPersonal("u_1");
    const batches = () => server.calls.filter((c) => c.url === "/api/progress" && c.method === "POST").length;

    localStorage.setItem(
      readerKey("bk_read"),
      JSON.stringify({ pageIndex: 0, completed: false, updatedAt: "2026-05-01T00:00:00.000Z" }),
    );
    await syncPersonal("u_1");
    expect(batches()).toBe(0);

    localStorage.setItem(
      readerKey("bk_read"),
      JSON.stringify({ pageIndex: 6, completed: false, updatedAt: "2026-05-03T00:00:00.000Z" }),
    );
    await syncPersonal("u_1");
    expect(batches()).toBe(1);
    expect(server.progress.find((p) => p.bookId === "bk_read")?.pageIndex).toBe(6);
  });

  it("are removed with the rest of the device copy on sign-out", async () => {
    const server = fakeServer({ signedIn: true });
    await syncPersonal("u_1");
    localStorage.setItem(
      readerKey("bk_read"),
      JSON.stringify({ pageIndex: 2, completed: false, updatedAt: "2026-05-01T00:00:00.000Z" }),
    );
    server.signedIn = false;
    await syncPersonal(null);
    expect(localStorage.getItem(readerKey("bk_read"))).toBeNull();
    expect(getSnapshot().progress).toEqual([]);
  });
});

describe("sync", () => {
  it("merges anonymous data into the account on first sign-in", async () => {
    const server = fakeServer({ signedIn: true });
    server.favorites.push({ bookId: "bk_server", createdAt: "2026-01-01T00:00:00.000Z" });
    setFavorite("bk_local", true);
    saveProgress("bk_local", 2);

    const result = await syncPersonal("u_1");
    expect(result).toMatchObject({ status: "synced", merged: 2, cleared: false });
    expect(server.calls.find((c) => c.url === "/api/favorites" && c.method === "POST")?.body).toEqual({
      bookIds: ["bk_local"],
    });
    expect(
      getSnapshot()
        .favorites.map((f) => f.bookId)
        .sort(),
    ).toEqual(["bk_local", "bk_server"]);
    expect(getSnapshot().progress.map((p) => p.bookId)).toEqual(["bk_local"]);
    expect(localStorage.getItem(OWNER_KEY)).toBe("u_1");
  });

  it("keeps the device data when the merge cannot reach the server", async () => {
    const server = fakeServer({ signedIn: true, offline: true });
    setFavorite("bk_local", true);
    expect((await syncPersonal("u_1")).status).toBe("error");
    expect(getSnapshot().favorites.map((f) => f.bookId)).toEqual(["bk_local"]);
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();

    server.offline = false;
    expect((await syncPersonal("u_1")).status).toBe("synced");
    expect(server.favorites.map((f) => f.bookId)).toEqual(["bk_local"]);
  });

  it("sends changes at once when signed in, and queues them while offline", async () => {
    const server = fakeServer({ signedIn: true });
    await syncPersonal("u_1");
    setFavorite("bk_1", true);
    await vi.waitFor(() => expect(server.favorites.map((f) => f.bookId)).toEqual(["bk_1"]));

    server.offline = true;
    setFavorite("bk_2", true);
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]")).toHaveLength(1));

    server.offline = false;
    await syncPersonal("u_1");
    expect(server.favorites.map((f) => f.bookId).sort()).toEqual(["bk_1", "bk_2"]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("clears the device copy on a confirmed sign-out, but not when offline", async () => {
    const server = fakeServer({ signedIn: true });
    server.favorites.push({ bookId: "bk_1", createdAt: "2026-01-01T00:00:00.000Z" });
    await syncPersonal("u_1");
    expect(getSnapshot().favorites).toHaveLength(1);

    // A page stored for offline use says "signed out" although the session is alive.
    server.offline = true;
    expect((await syncPersonal(null)).cleared).toBe(false);
    server.offline = false;
    expect((await syncPersonal(null)).cleared).toBe(false);
    expect(getSnapshot().favorites).toHaveLength(1);

    server.signedIn = false;
    expect((await syncPersonal(null)).cleared).toBe(true);
    expect(getSnapshot().favorites).toEqual([]);
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it("drops another user's data instead of merging it", async () => {
    const server = fakeServer({ signedIn: true });
    server.favorites.push({ bookId: "bk_1", createdAt: "2026-01-01T00:00:00.000Z" });
    await syncPersonal("u_1");
    server.favorites = [];
    const result = await syncPersonal("u_2");
    expect(result).toMatchObject({ cleared: true, merged: 0 });
    expect(server.favorites).toEqual([]);
    expect(getSnapshot().favorites).toEqual([]);
    expect(localStorage.getItem(OWNER_KEY)).toBe("u_2");
  });

  it("sends progress to the account after a short delay", async () => {
    const server = fakeServer({ signedIn: true });
    await syncPersonal("u_1");
    vi.useFakeTimers();
    saveProgress("bk_1", 1);
    saveProgress("bk_1", 2);
    saveProgress("bk_1", 3, true);
    expect(server.calls.filter((c) => c.url === "/api/progress" && c.method === "POST")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    const posts = server.calls.filter((c) => c.url === "/api/progress" && c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ bookId: "bk_1", pageIndex: 3, completed: true });
  });
});
