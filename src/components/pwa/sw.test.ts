/**
 * Runs public/sw.js inside a fake service worker scope and checks its routing
 * rules. This is not a browser test: Cache Storage and fetch are stand-ins.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { BOOKS_CACHE } from "./offline-store";

const ORIGIN = "https://stories.test";
const SOURCE = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

type RequestLike = string | { url: string };

class FakeCache {
  entries = new Map<string, Response>();
  private key(request: RequestLike): string {
    return new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
  }
  async match(request: RequestLike, options?: { ignoreSearch?: boolean }) {
    const key = this.key(request);
    const exact = this.entries.get(key);
    if (exact) return exact.clone();
    if (options?.ignoreSearch) {
      const wanted = new URL(key).pathname;
      for (const [url, response] of this.entries) {
        if (new URL(url).pathname === wanted) return response.clone();
      }
    }
    return undefined;
  }
  async put(request: RequestLike, response: Response) {
    this.entries.set(this.key(request), response);
  }
  async delete(request: RequestLike) {
    return this.entries.delete(this.key(request));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
}

interface FetchCall {
  url: string;
  credentials?: string;
}

type Handler = (event: unknown) => void;

function createWorker() {
  const cacheMap = new Map<string, FakeCache>();
  const handlers: Record<string, Handler> = {};
  const net = {
    offline: false,
    calls: [] as FetchCall[],
    routes: new Map<string, () => Response>(),
  };
  const caches = {
    open: async (name: string) => {
      if (!cacheMap.has(name)) cacheMap.set(name, new FakeCache());
      return cacheMap.get(name)!;
    },
    keys: async () => [...cacheMap.keys()],
    delete: async (name: string) => cacheMap.delete(name),
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const fetchStub = async (input: RequestLike, init?: { credentials?: string }) => {
    const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
    net.calls.push({ url: url.pathname + url.search, credentials: init?.credentials });
    if (net.offline) throw new TypeError("offline");
    const route = net.routes.get(url.pathname);
    return route ? route() : new Response("not found", { status: 404 });
  };
  vm.runInNewContext(SOURCE, { self, caches, fetch: fetchStub, Response, URL, Headers, console });

  /** Dispatches a fetch event; resolves to null when the worker left the request alone. */
  async function dispatch(
    pathOrUrl: string,
    init: { method?: string; mode?: string; headers?: Record<string, string> } = {},
  ): Promise<Response | null> {
    const responses: Promise<Response>[] = [];
    handlers.fetch({
      request: {
        url: new URL(pathOrUrl, ORIGIN).href,
        method: init.method ?? "GET",
        mode: init.mode ?? "cors",
        headers: new Headers(init.headers),
      },
      respondWith: (response: Promise<Response>) => {
        responses.push(Promise.resolve(response));
      },
    });
    return responses.length > 0 ? responses[0] : null;
  }

  async function lifecycle(type: "install" | "activate"): Promise<void> {
    const pending: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  }

  return { caches, cacheMap, net, dispatch, lifecycle };
}

const html = (body: string) => () =>
  new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });

let worker: ReturnType<typeof createWorker>;

beforeEach(() => {
  worker = createWorker();
  worker.net.routes.set(
    "/offline",
    html('<link rel="stylesheet" href="/_next/static/css/app.css"><script src="/_next/static/chunks/a.js"></script>'),
  );
  worker.net.routes.set("/offline/read", html('<script src="/_next/static/chunks/b.js"></script>'));
  for (const asset of ["/_next/static/css/app.css", "/_next/static/chunks/a.js", "/_next/static/chunks/b.js"]) {
    worker.net.routes.set(asset, () => new Response("asset", { status: 200 }));
  }
  worker.net.routes.set("/icons/icon.svg", () => new Response("<svg/>", { status: 200 }));
});

async function cacheNames() {
  const names = await worker.caches.keys();
  return {
    shell: names.find((name) => name.includes("shell"))!,
    statics: names.find((name) => name.includes("static"))!,
  };
}

describe("install", () => {
  it("stores the offline pages and their assets, fetched without cookies", async () => {
    await worker.lifecycle("install");
    const { shell, statics } = await cacheNames();
    expect([...worker.cacheMap.get(shell)!.entries.keys()].sort()).toEqual([
      `${ORIGIN}/offline`,
      `${ORIGIN}/offline/read`,
    ]);
    expect([...worker.cacheMap.get(statics)!.entries.keys()]).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/_next/static/css/app.css`,
        `${ORIGIN}/_next/static/chunks/a.js`,
        `${ORIGIN}/_next/static/chunks/b.js`,
      ]),
    );
    expect(worker.net.calls.length).toBeGreaterThan(0);
    expect(worker.net.calls.every((call) => call.credentials === "omit")).toBe(true);
  });

  it("still installs when the network is down", async () => {
    worker.net.offline = true;
    await expect(worker.lifecycle("install")).resolves.toBeUndefined();
  });

  it("activation removes caches of older versions but keeps downloaded books", async () => {
    await worker.caches.open("mystory-static-v0");
    await worker.caches.open(BOOKS_CACHE);
    await worker.caches.open("someone-else");
    await worker.lifecycle("activate");
    const names = await worker.caches.keys();
    expect(names).toContain(BOOKS_CACHE);
    expect(names).toContain("someone-else");
    expect(names).not.toContain("mystory-static-v0");
  });
});

describe("requests the worker must leave alone", () => {
  it("ignores mutations, the API, other origins and RSC payloads", async () => {
    expect(await worker.dispatch("/api/favorites/bk_1", { method: "POST" })).toBeNull();
    expect(await worker.dispatch("/me", { method: "POST", mode: "navigate" })).toBeNull();
    expect(await worker.dispatch("/api/progress")).toBeNull();
    expect(await worker.dispatch("https://elsewhere.test/media/x.png")).toBeNull();
    expect(await worker.dispatch("/me?_rsc=abc")).toBeNull();
    expect(await worker.dispatch("/me", { headers: { RSC: "1" } })).toBeNull();
    expect(await worker.dispatch("/offline/book/bk_1")).toBeNull();
  });
});

describe("navigations", () => {
  it("come from the network and are never stored", async () => {
    worker.net.routes.set("/me", html("private page of dana"));
    const response = await worker.dispatch("/me", { mode: "navigate" });
    expect(await response!.text()).toBe("private page of dana");
    for (const cache of worker.cacheMap.values()) {
      expect([...cache.entries.keys()].some((url) => url.endsWith("/me"))).toBe(false);
    }
  });

  it("offline: redirect to the offline page, or to the offline reader for a downloaded book", async () => {
    await worker.lifecycle("install");
    const books = await worker.caches.open(BOOKS_CACHE);
    await books.put("/offline/book/bk_1", new Response(JSON.stringify({ id: "bk_1", slug: "my-book" })));
    worker.net.offline = true;

    const home = await worker.dispatch("/", { mode: "navigate" });
    expect(home!.status).toBe(302);
    expect(home!.headers.get("location")).toBe(`${ORIGIN}/offline`);

    const read = await worker.dispatch("/read/my-book?page=3", { mode: "navigate" });
    expect(read!.headers.get("location")).toBe(`${ORIGIN}/offline/read?book=bk_1&page=3`);
    const details = await worker.dispatch("/book/my-book", { mode: "navigate" });
    expect(details!.headers.get("location")).toBe(`${ORIGIN}/offline/read?book=bk_1`);
    const unknown = await worker.dispatch("/read/another-book", { mode: "navigate" });
    expect(unknown!.headers.get("location")).toBe(`${ORIGIN}/offline`);

    const shell = await worker.dispatch("/offline/read?book=bk_1", { mode: "navigate" });
    expect(shell!.status).toBe(200);
    expect(await shell!.text()).toContain("chunks/b.js");
  });

  it("offline with nothing stored: a plain Hebrew 503 page", async () => {
    worker.net.offline = true;
    const response = await worker.dispatch("/", { mode: "navigate" });
    expect(response!.status).toBe(503);
    expect(await response!.text()).toContain("אין חיבור לרשת");
  });
});

describe("media", () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const cached = () => new Response(bytes, { status: 200, headers: { "Content-Type": "audio/wav" } });
  const read = async (response: Response | null) => [...new Uint8Array(await response!.arrayBuffer())];

  it("is not stored by merely being viewed", async () => {
    worker.net.routes.set("/media/books/b/page-01.svg", () => new Response("<svg/>", { status: 200 }));
    const response = await worker.dispatch("/media/books/b/page-01.svg?v=1");
    expect(response!.status).toBe(200);
    expect(worker.cacheMap.get(BOOKS_CACHE)?.entries.size ?? 0).toBe(0);
  });

  it("serves a downloaded, versioned file without the network, including byte ranges", async () => {
    const books = await worker.caches.open(BOOKS_CACHE);
    await books.put("/media/books/b/audio.wav?v=1", cached());
    worker.net.offline = true;

    expect(await read(await worker.dispatch("/media/books/b/audio.wav?v=1"))).toEqual([...bytes]);
    expect(worker.net.calls).toEqual([]);

    const part = await worker.dispatch("/media/books/b/audio.wav?v=1", { headers: { Range: "bytes=2-5" } });
    expect(part!.status).toBe(206);
    expect(part!.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await read(part)).toEqual([2, 3, 4, 5]);

    const tail = await worker.dispatch("/media/books/b/audio.wav?v=1", { headers: { Range: "bytes=-3" } });
    expect(await read(tail)).toEqual([7, 8, 9]);
    const open = await worker.dispatch("/media/books/b/audio.wav?v=1", { headers: { Range: "bytes=8-" } });
    expect(open!.headers.get("content-range")).toBe("bytes 8-9/10");
    const beyond = await worker.dispatch("/media/books/b/audio.wav?v=1", { headers: { Range: "bytes=50-60" } });
    expect(beyond!.status).toBe(416);
  });

  it("prefers the network for another version and falls back to the stored file when offline", async () => {
    const books = await worker.caches.open(BOOKS_CACHE);
    await books.put("/media/books/b/audio.wav?v=1", cached());
    worker.net.routes.set("/media/books/b/audio.wav", () => new Response("fresh", { status: 200 }));

    expect(await (await worker.dispatch("/media/books/b/audio.wav?v=2"))!.text()).toBe("fresh");
    worker.net.offline = true;
    expect(await read(await worker.dispatch("/media/books/b/audio.wav?v=2"))).toEqual([...bytes]);
    const missing = await worker.dispatch("/media/books/b/other.wav?v=2");
    expect(missing!.type).toBe("error");
  });
});

describe("static files", () => {
  it("are cached on first use and then served without the network", async () => {
    expect(await (await worker.dispatch("/_next/static/chunks/a.js"))!.text()).toBe("asset");
    await new Promise((resolve) => setTimeout(resolve, 10));
    worker.net.offline = true;
    expect(await (await worker.dispatch("/_next/static/chunks/a.js"))!.text()).toBe("asset");
  });
});

describe("when Cache Storage is unavailable", () => {
  beforeEach(() => {
    // Seen in the wild (blocked storage, a damaged profile): every caches call rejects.
    const broken = async () => {
      throw new Error("Unexpected internal error");
    };
    worker.caches.open = broken as unknown as typeof worker.caches.open;
    worker.caches.keys = broken as unknown as typeof worker.caches.keys;
    worker.net.routes.set("/media/books/b1/p1.svg", () => new Response("<svg/>", { status: 200 }));
  });

  it("installs, activates and serves everything from the network", async () => {
    await worker.lifecycle("install");
    await worker.lifecycle("activate");

    const media = await worker.dispatch("/media/books/b1/p1.svg?v=1");
    expect(media?.status).toBe(200);
    const asset = await worker.dispatch("/_next/static/chunks/a.js");
    expect(await asset?.text()).toBe("asset");
    const icon = await worker.dispatch("/icons/icon.svg");
    expect(icon?.status).toBe(200);
    const page = await worker.dispatch("/offline", { mode: "navigate" });
    expect(page?.status).toBe(200);
  });

  it("offline: answers with the plain 503 page instead of failing", async () => {
    worker.net.offline = true;
    const page = await worker.dispatch("/read/some-book", { mode: "navigate" });
    expect(page?.status).toBe(503);
    expect(await page?.text()).toContain("אין חיבור לרשת");
  });
});
