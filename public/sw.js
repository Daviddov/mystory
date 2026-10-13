/*
 * Service worker of "הסיפור שלי". Hand written, no build step.
 *
 * What it does, and deliberately does not do:
 *
 *   Page navigations (HTML)    Network only. HTML is NEVER cached at runtime, because
 *                              every page is rendered per user (the header shows the
 *                              account). When the network fails the visitor is sent
 *                              to the offline pages below.
 *   /offline, /offline/read    The only cached HTML. Fetched WITHOUT cookies when the
 *                              worker installs, so the stored copy is the anonymous one.
 *   /api/*, non-GET requests,  Never touched: the browser talks to the server directly.
 *   RSC / data requests
 *   /_next/static/*            Cache first (file names are content hashed).
 *   /icons/*                   Stale while revalidate.
 *   /media/*                   Served from the "downloaded books" cache when the exact
 *                              versioned URL is there, otherwise from the network, and
 *                              from the cache again when the network fails. Byte ranges
 *                              (audio seeking) are answered from the cached file.
 *                              Media is only ever stored by the explicit
 *                              "download for offline" button (see offline-store.ts).
 *
 * BOOKS_CACHE must match src/components/pwa/offline-store.ts.
 */

const VERSION = "v1";
const STATIC_CACHE = `mystory-static-${VERSION}`;
const SHELL_CACHE = `mystory-shell-${VERSION}`;
const BOOKS_CACHE = "mystory-books-v1";
const KEEP = [STATIC_CACHE, SHELL_CACHE, BOOKS_CACHE];

const SHELL_URLS = ["/offline", "/offline/read"];
const ICON_URLS = ["/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
const STATIC_LIMIT = 400;

// ---------------------------------------------------------------------------
// Install / activate
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  // The shell is a convenience; a failure here must not block the worker.
  event.waitUntil(
    precacheShell()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("mystory-") && !KEEP.includes(name))
            .map((name) => caches.delete(name)),
        );
      } catch {
        // Cache Storage unavailable: nothing to clean up.
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "refresh-shell") {
    event.waitUntil(precacheShell().catch(() => undefined));
  }
});

/**
 * Stores the offline pages and every script, style sheet and font they link to.
 * Requests are sent without credentials so the stored HTML is never personal.
 */
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  const statics = await caches.open(STATIC_CACHE);
  const assets = new Set(ICON_URLS);

  for (const url of SHELL_URLS) {
    const response = await fetch(url, { credentials: "omit", cache: "no-store" });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || response.redirected || !type.includes("text/html")) continue;
    const html = await response.clone().text();
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
      assets.add(match[1].replace(/&amp;/g, "&"));
    }
    await shell.put(url, response);
  }

  await Promise.all(
    [...assets].map(async (url) => {
      try {
        if (await statics.match(url)) return;
        const response = await fetch(url, { credentials: "omit" });
        if (response.ok) await statics.put(url, response);
      } catch {
        // One missing asset must not fail the others.
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // mutations always go straight to the network

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  // React Server Component payloads and prefetches are per user: never cached.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/media/")) {
    event.respondWith(handleMedia(request, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // Everything else (including /offline/book/<id> JSON and /_next/image): default network.
});

/**
 * Cache Storage can be unavailable (storage blocked, quota or profile errors).
 * The worker must then behave as if it were not installed: every request still
 * goes to the network instead of failing.
 */
async function openCache(name) {
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
}

async function matchSafely(cache, key, options) {
  if (!cache) return undefined;
  try {
    return await cache.match(key, options);
  } catch {
    return undefined;
  }
}

async function handleNavigation(request, url) {
  try {
    return await fetch(request);
  } catch {
    const shell = await openCache(SHELL_CACHE);
    if (!shell) return offlineDocument();

    if (SHELL_URLS.includes(stripSlash(url.pathname))) {
      const cached = await matchSafely(shell, stripSlash(url.pathname));
      if (cached) return cached;
      return offlineDocument();
    }

    // A downloaded book opened through its normal address: open the offline reader instead.
    const bookMatch = /^\/(?:read|book)\/([^/]+)\/?$/.exec(url.pathname);
    if (bookMatch && (await matchSafely(shell, "/offline/read"))) {
      const bookId = await findDownloadedBookId(safeDecode(bookMatch[1]));
      if (bookId) {
        const page = Number(url.searchParams.get("page"));
        const suffix = Number.isInteger(page) && page > 1 ? `&page=${page}` : "";
        return redirectTo(`/offline/read?book=${encodeURIComponent(bookId)}${suffix}`);
      }
    }

    if (await matchSafely(shell, "/offline")) return redirectTo("/offline");
    return offlineDocument();
  }
}

function redirectTo(path) {
  return Response.redirect(new URL(path, self.location.origin).href, 302);
}

function stripSlash(pathname) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function findDownloadedBookId(slug) {
  try {
    const cache = await caches.open(BOOKS_CACHE);
    for (const key of await cache.keys()) {
      if (!new URL(key.url).pathname.startsWith("/offline/book/")) continue;
      const response = await cache.match(key);
      const book = response ? await response.json() : null;
      if (book && book.slug === slug && typeof book.id === "string") return book.id;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Last resort when even the offline page was never stored. */
function offlineDocument() {
  const html =
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>אין חיבור לרשת</title>' +
    "<style>body{font-family:system-ui,sans-serif;background:#fff8ec;color:#3b2f2a;margin:0;min-height:100vh;" +
    "display:flex;align-items:center;justify-content:center;text-align:center;padding:1.5rem}" +
    "a{display:inline-block;margin-top:1rem;padding:.9rem 1.6rem;border-radius:999px;background:#d9480f;" +
    "color:#fff;font-weight:700;text-decoration:none}</style></head><body><main>" +
    '<p style="font-size:4rem;margin:0" aria-hidden="true">📖</p><h1>אין חיבור לרשת</h1>' +
    "<p>כשהחיבור יחזור אפשר יהיה להמשיך לקרוא.</p>" +
    '<a href="">לנסות שוב</a></main></body></html>';
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function handleMedia(request, url) {
  const cache = await openCache(BOOKS_CACHE);
  const key = url.pathname + url.search;

  // A versioned URL (?v=<updatedAt>) never changes content, so the stored copy is safe to use first.
  if (url.searchParams.has("v")) {
    const exact = await matchSafely(cache, key);
    if (exact) return ranged(exact, request);
  }
  try {
    return await fetch(request);
  } catch {
    const fallback =
      (await matchSafely(cache, key)) || (await matchSafely(cache, url.pathname, { ignoreSearch: true }));
    if (fallback) return ranged(fallback, request);
    return Response.error();
  }
}

/** Answers a Range request (audio seeking, Safari media loading) from a complete cached response. */
async function ranged(response, request) {
  const header = request.headers.get("range");
  if (!header) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return response;

  const buffer = await response.arrayBuffer();
  const size = buffer.byteLength;
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
    if (suffix <= 0) start = size; // forces 416 below
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  const type = response.headers.get("content-type") || "application/octet-stream";
  if (size === 0 || start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Content-Type": type },
    });
  }
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

async function cacheFirst(request) {
  const cache = await openCache(STATIC_CACHE);
  const cached = await matchSafely(cache, request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cache && response.status === 200) {
    cache
      .put(request, response.clone())
      .then(() => trim(cache))
      .catch(() => undefined);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await openCache(STATIC_CACHE);
  const cached = await matchSafely(cache, request);
  const refresh = fetch(request)
    .then((response) => {
      if (cache && response.status === 200) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  return (await refresh) || Response.error();
}

/** Old builds leave unused files behind; drop the oldest entries when the cache grows. */
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= STATIC_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - STATIC_LIMIT + 50).map((key) => cache.delete(key)));
}
