/**
 * Books downloaded for reading without a network. Client-safe (no Node imports).
 *
 * A download is stored in Cache Storage, in the cache named BOOKS_CACHE:
 *   /offline/book/<bookId>   the OfflineBook JSON (text, timings, asset URLs)
 *   /media/...               every illustration and narration file of the book
 * The service worker (public/sw.js) serves /media requests from that cache when
 * the network is unavailable. The cache name is duplicated in public/sw.js.
 */

export const BOOKS_CACHE = "mystory-books-v1";
export const OFFLINE_EVENT = "mystory:offline";
export const OFFLINE_FORMAT_VERSION = 1;

export interface OfflinePage {
  index: number;
  text: string;
  textNikud?: string;
  /** Browser URL of the illustration (already passed through mediaUrl). */
  image?: string;
  /** Browser URL of the narration. */
  audio?: string;
  wordTimings?: { word: string; start: number; end: number }[];
  audioSource?: "tts" | "recorded" | "mock";
}

export interface OfflineBook {
  version: number;
  id: string;
  slug: string;
  title: string;
  summary: string;
  author: string;
  illustrator: string;
  license: string;
  ageGroup: string;
  readingMinutes: number;
  updatedAt: string;
  /** Browser URL of the cover, "" when the book has none. */
  cover: string;
  /** False for private books; those downloads are removed from the device on sign-out. */
  isPublic: boolean;
  pages: OfflinePage[];
  /** Every URL that must be cached for the book to work offline. */
  assets: string[];
  /** Set on the device when the download finished. */
  downloadedAt?: string;
}

export function offlineBookPath(bookId: string): string {
  return `/offline/book/${encodeURIComponent(bookId)}`;
}

export function offlineReadPath(bookId: string, page?: number): string {
  const base = `/offline/read?book=${encodeURIComponent(bookId)}`;
  return page && page > 1 ? `${base}&page=${page}` : base;
}

/** Cache Storage needs a secure context (https or localhost). */
export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && window.isSecureContext;
}

/** True when a service worker controls this page, i.e. cached files are really served offline. */
export function offlineReady(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
}

function emitChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_EVENT));
}

function isOfflineBook(value: unknown): value is OfflineBook {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<OfflineBook>;
  return (
    typeof book.id === "string" &&
    typeof book.slug === "string" &&
    typeof book.title === "string" &&
    Array.isArray(book.pages) &&
    Array.isArray(book.assets)
  );
}

/** The asset URL with the share token added as `t` (the parameter /media reads). Unchanged without a token. */
export function withShareToken(url: string, token: string | undefined): string {
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
}

/** Only same-origin media and Next image URLs may be cached; anything else is ignored. */
function isCacheableAsset(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/media/");
  } catch {
    return false;
  }
}

export interface DownloadProgress {
  done: number;
  total: number;
}

export interface DownloadOptions {
  /** Share token, for a private book opened through a share link. */
  token?: string;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
}

export class OfflineDownloadError extends Error {
  constructor(
    message: string,
    readonly failed: string[] = [],
  ) {
    super(message);
    this.name = "OfflineDownloadError";
  }
}

/**
 * Downloads one book into Cache Storage. Resolves only when the book data and
 * EVERY asset were stored; on any failure the partial download is removed and
 * OfflineDownloadError is thrown, so a book is never reported as available
 * offline when part of it is missing.
 */
export async function downloadBook(bookId: string, options: DownloadOptions = {}): Promise<OfflineBook> {
  if (!offlineSupported()) throw new OfflineDownloadError("הדפדפן הזה לא תומך בשמירה לקריאה בלי רשת");
  const { token, onProgress, signal } = options;
  const path = offlineBookPath(bookId);
  const manifestUrl = token ? `${path}?token=${encodeURIComponent(token)}` : path;

  let book: OfflineBook;
  try {
    const response = await fetch(manifestUrl, { cache: "no-store", signal, credentials: "same-origin" });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data: unknown = await response.json();
    if (!isOfflineBook(data)) throw new Error("unexpected response");
    book = data;
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new OfflineDownloadError("לא הצלחנו לקבל את פרטי הספר. בדקו את החיבור ונסו שוב.");
  }

  const assets = [...new Set(book.assets)].filter(isCacheableAsset);
  const skipped = book.assets.filter((url) => !isCacheableAsset(url));
  const cache = await caches.open(BOOKS_CACHE);
  const total = assets.length + 1;
  let done = 0;
  onProgress?.({ done, total });

  const stored: string[] = [];
  const failed: string[] = [...skipped];
  // A few at a time: fast enough, and gentle on a child's tablet.
  const queue = [...assets];
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      try {
        // Media of an unpublished book is served only to its owner (session
        // cookie) or with the share token. The token goes on the request only;
        // the file is stored under its plain address, which is what the offline
        // reader asks the cache for.
        const response = await fetch(withShareToken(url, token), { cache: "no-cache", signal });
        // Only complete 200 responses are usable (a 206 or an opaque response is not).
        if (response.status !== 200) throw new Error(`status ${response.status}`);
        await cache.put(url, response);
        stored.push(url);
      } catch {
        failed.push(url);
      }
      done += 1;
      onProgress?.({ done, total });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));

  if (signal?.aborted || failed.length > 0) {
    await Promise.all(stored.map((url) => cache.delete(url)));
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    throw new OfflineDownloadError(
      `${failed.length} קבצים של הספר לא נשמרו, ולכן הוא לא זמין בלי רשת. נסו שוב.`,
      failed,
    );
  }

  const saved: OfflineBook = { ...book, assets, downloadedAt: new Date().toISOString() };
  try {
    await cache.put(
      path,
      new Response(JSON.stringify(saved), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
  } catch {
    await Promise.all(stored.map((url) => cache.delete(url)));
    throw new OfflineDownloadError("אין מספיק מקום במכשיר כדי לשמור את הספר.");
  }
  onProgress?.({ done: total, total });

  // Ask the browser not to evict the downloads under storage pressure (best effort).
  try {
    await navigator.storage?.persist?.();
  } catch {
    // ignore
  }
  emitChange();
  return saved;
}

async function readManifest(cache: Cache, request: RequestInfo): Promise<OfflineBook | null> {
  try {
    const response = await cache.match(request);
    if (!response) return null;
    const data: unknown = await response.json();
    return isOfflineBook(data) ? data : null;
  } catch {
    return null;
  }
}

export async function getDownload(bookId: string): Promise<OfflineBook | null> {
  if (!offlineSupported()) return null;
  const cache = await caches.open(BOOKS_CACHE);
  return readManifest(cache, offlineBookPath(bookId));
}

/** All downloaded books, most recently downloaded first. */
export async function listDownloads(): Promise<OfflineBook[]> {
  if (!offlineSupported()) return [];
  const cache = await caches.open(BOOKS_CACHE);
  const keys = await cache.keys();
  const books: OfflineBook[] = [];
  for (const request of keys) {
    if (!new URL(request.url).pathname.startsWith("/offline/book/")) continue;
    const book = await readManifest(cache, request);
    if (book) books.push(book);
  }
  return books.sort((a, b) => (b.downloadedAt ?? "").localeCompare(a.downloadedAt ?? ""));
}

export async function removeDownload(bookId: string): Promise<void> {
  if (!offlineSupported()) return;
  const cache = await caches.open(BOOKS_CACHE);
  const book = await readManifest(cache, offlineBookPath(bookId));
  if (book) {
    // Keep files that another downloaded book also uses.
    const others = (await listDownloads()).filter((other) => other.id !== bookId);
    const shared = new Set(others.flatMap((other) => other.assets));
    await Promise.all(book.assets.filter((url) => !shared.has(url)).map((url) => cache.delete(url)));
  }
  await cache.delete(offlineBookPath(bookId));
  emitChange();
}

/** Removes downloads of private books. Called when the user signs out on a shared device. */
export async function removePrivateDownloads(): Promise<void> {
  const books = await listDownloads();
  for (const book of books) {
    if (!book.isPublic) await removeDownload(book.id);
  }
}

/** Storage used by the whole site on this device, when the browser reports it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || estimate.usage === undefined || estimate.quota === undefined) return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}
