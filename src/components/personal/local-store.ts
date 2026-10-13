/**
 * Favorites and reading progress on the device. Client-safe.
 *
 * The device copy (localStorage) is what the UI reads, for everyone:
 *   - anonymous visitor: it is the only copy;
 *   - signed-in user: it mirrors the account. Every change is also sent to the
 *     server, and changes made without a network wait in a queue.
 *
 * syncPersonal(userId) reconciles the two. It runs when the signed-in user is
 * known or changes (see PersonalSync):
 *   - first sign-in on this device: anonymous favorites and progress are MERGED
 *     into the account, then the device copy is replaced by the account state;
 *   - same user again: queued changes are sent, then the account state is loaded;
 *   - sign-out or a different user: the device copy is cleared.
 */

export const FAVORITES_KEY = "mystory:favorites";
export const PROGRESS_KEY = "mystory:progress";
/** "" while the device data is anonymous, otherwise the user id it mirrors. */
export const OWNER_KEY = "mystory:personal-owner";
export const PENDING_KEY = "mystory:personal-pending";
export const PERSONAL_EVENT = "mystory:personal";

/**
 * The reader keeps its own "continue where you stopped" entry per book under
 * "mystory:progress:<bookId>" (see src/lib/reader/storage.ts). Those entries
 * are read here as device progress, so they show up on /me and are merged into
 * the account at sign-in. They are never written here, only removed when the
 * device copy is cleared.
 */
export const READER_PROGRESS_PREFIX = "mystory:progress:";

const MAX_ITEMS = 200;

export interface LocalFavorite {
  bookId: string;
  createdAt: string;
}

export interface LocalProgress {
  bookId: string;
  /** Zero-based index of the last page reached. */
  pageIndex: number;
  completed: boolean;
  updatedAt: string;
}

export type PendingOp =
  | { type: "favorite"; bookId: string; on: boolean }
  | { type: "progress"; item: LocalProgress };

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export interface PersonalSnapshot {
  favorites: LocalFavorite[];
  progress: LocalProgress[];
  /** "" for anonymous device data. */
  ownerId: string;
  status: SyncStatus;
  /** False during server rendering and before the first client read. */
  loaded: boolean;
}

const EMPTY: PersonalSnapshot = { favorites: [], progress: [], ownerId: "", status: "idle", loaded: false };

// ---------------------------------------------------------------------------
// Storage (every access is guarded: private mode and blocked storage throw)
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Quota or blocked storage: the in-memory snapshot still works for this page.
  }
}

function readList<T>(key: string, guard: (value: unknown) => value is T): T[] {
  const raw = readRaw(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function readerKeys(): string[] {
  const keys: string[] = [];
  try {
    const store = storage();
    if (!store) return keys;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith(READER_PROGRESS_PREFIX)) keys.push(key);
    }
  } catch {
    // blocked storage
  }
  return keys;
}

/** Positions saved by the reader itself, one per book. */
function readReaderProgress(): LocalProgress[] {
  const items: LocalProgress[] = [];
  for (const key of readerKeys()) {
    try {
      const value = JSON.parse(readRaw(key) ?? "null") as Partial<LocalProgress> | null;
      const item = { ...value, bookId: key.slice(READER_PROGRESS_PREFIX.length) };
      if (isProgress(item)) {
        items.push({
          bookId: item.bookId,
          pageIndex: item.pageIndex,
          completed: item.completed,
          updatedAt: item.updatedAt,
        });
      }
    } catch {
      // corrupt entry: ignore
    }
  }
  return items;
}

function readOwnProgress(): LocalProgress[] {
  return readList(PROGRESS_KEY, isProgress);
}

function isFavorite(value: unknown): value is LocalFavorite {
  const v = value as Partial<LocalFavorite> | null;
  return !!v && typeof v.bookId === "string" && ID_RE.test(v.bookId) && typeof v.createdAt === "string";
}

function isProgress(value: unknown): value is LocalProgress {
  const v = value as Partial<LocalProgress> | null;
  return (
    !!v &&
    typeof v.bookId === "string" &&
    ID_RE.test(v.bookId) &&
    typeof v.pageIndex === "number" &&
    Number.isInteger(v.pageIndex) &&
    v.pageIndex >= 0 &&
    typeof v.completed === "boolean" &&
    typeof v.updatedAt === "string"
  );
}

function isPending(value: unknown): value is PendingOp {
  const v = value as { type?: unknown; bookId?: unknown; on?: unknown; item?: unknown } | null;
  if (!v) return false;
  if (v.type === "favorite") return typeof v.bookId === "string" && ID_RE.test(v.bookId) && typeof v.on === "boolean";
  return v.type === "progress" && isProgress(v.item);
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Newest first, one entry per book. */
export function normalizeFavorites(list: LocalFavorite[]): LocalFavorite[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((f) => (seen.has(f.bookId) ? false : (seen.add(f.bookId), true)))
    .slice(0, MAX_ITEMS);
}

/** Most recent first, one entry per book (the most recent one wins). */
export function normalizeProgress(list: LocalProgress[]): LocalProgress[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((p) => (seen.has(p.bookId) ? false : (seen.add(p.bookId), true)))
    .slice(0, MAX_ITEMS);
}

/** Applies a new position. `completed` is sticky unless passed explicitly. */
export function applyProgress(
  list: LocalProgress[],
  bookId: string,
  pageIndex: number,
  completed: boolean | undefined,
  now: string,
): LocalProgress[] {
  const existing = list.find((p) => p.bookId === bookId);
  const next: LocalProgress = {
    bookId,
    pageIndex: Math.max(0, Math.floor(pageIndex)),
    completed: completed ?? existing?.completed ?? false,
    updatedAt: now,
  };
  return normalizeProgress([next, ...list.filter((p) => p.bookId !== bookId)]);
}

/** Collapses a queue so only the last operation per book and kind remains. */
export function compactPending(ops: PendingOp[]): PendingOp[] {
  const last = new Map<string, PendingOp>();
  for (const op of ops) {
    const key = op.type === "favorite" ? `f:${op.bookId}` : `p:${op.item.bookId}`;
    last.delete(key);
    last.set(key, op);
  }
  return [...last.values()].slice(-MAX_ITEMS);
}

// ---------------------------------------------------------------------------
// Snapshot store (for useSyncExternalStore)
// ---------------------------------------------------------------------------

let snapshot: PersonalSnapshot = EMPTY;
let status: SyncStatus = "idle";
let mutations = 0;
const listeners = new Set<() => void>();
let listening = false;

function load(): void {
  snapshot = {
    favorites: normalizeFavorites(readList(FAVORITES_KEY, isFavorite)),
    // normalizeProgress keeps the most recent entry per book.
    progress: normalizeProgress([...readOwnProgress(), ...readReaderProgress()]),
    ownerId: readRaw(OWNER_KEY) ?? "",
    status,
    loaded: true,
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function commit(next: Partial<Pick<PersonalSnapshot, "favorites" | "progress" | "ownerId">>): void {
  if (next.favorites) writeRaw(FAVORITES_KEY, JSON.stringify(next.favorites));
  if (next.progress) writeRaw(PROGRESS_KEY, JSON.stringify(next.progress));
  if (next.ownerId !== undefined) writeRaw(OWNER_KEY, next.ownerId || null);
  snapshot = { ...snapshot, ...next, status, loaded: true };
  notify();
  try {
    window.dispatchEvent(new Event(PERSONAL_EVENT));
  } catch {
    // not in a browser
  }
}

function setStatus(next: SyncStatus): void {
  status = next;
  snapshot = { ...snapshot, status };
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    // Another tab changed the device data.
    window.addEventListener("storage", (event) => {
      if (
        event.key === null ||
        [FAVORITES_KEY, PROGRESS_KEY, OWNER_KEY].includes(event.key) ||
        event.key.startsWith(READER_PROGRESS_PREFIX)
      ) {
        load();
        notify();
      }
    });
    window.addEventListener("pagehide", flushProgressTimers);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): PersonalSnapshot {
  if (!snapshot.loaded && typeof window !== "undefined") load();
  return snapshot;
}

export function getServerSnapshot(): PersonalSnapshot {
  return EMPTY;
}

// ---------------------------------------------------------------------------
// Talking to the server
// ---------------------------------------------------------------------------

type PushResult = "ok" | "retry" | "drop";

async function push(op: PendingOp, keepalive = false): Promise<PushResult> {
  try {
    const response =
      op.type === "favorite"
        ? await fetch(`/api/favorites/${encodeURIComponent(op.bookId)}`, {
            method: op.on ? "POST" : "DELETE",
            headers: op.on ? { "Content-Type": "application/json" } : undefined,
            body: op.on ? "{}" : undefined,
            keepalive,
          })
        : await fetch("/api/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookId: op.item.bookId,
              pageIndex: op.item.pageIndex,
              completed: op.item.completed,
            }),
            keepalive,
          });
    if (response.ok) return "ok";
    // 4xx will never succeed later (signed out, book removed); 5xx may.
    return response.status >= 500 ? "retry" : "drop";
  } catch {
    return "retry";
  }
}

function readPending(): PendingOp[] {
  return readList(PENDING_KEY, isPending);
}

function queue(op: PendingOp): void {
  writeRaw(PENDING_KEY, JSON.stringify(compactPending([...readPending(), op])));
}

async function send(op: PendingOp, keepalive = false): Promise<void> {
  if (!getSnapshot().ownerId) return; // anonymous: the device copy is all there is
  if ((await push(op, keepalive)) === "retry") queue(op);
}

async function flushPending(): Promise<boolean> {
  const ops = compactPending(readPending());
  const remaining: PendingOp[] = [];
  for (const op of ops) {
    if ((await push(op)) === "retry") remaining.push(op);
  }
  writeRaw(PENDING_KEY, remaining.length ? JSON.stringify(remaining) : null);
  return remaining.length === 0;
}

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

export function isFavoriteBook(bookId: string): boolean {
  return getSnapshot().favorites.some((f) => f.bookId === bookId);
}

export function setFavorite(bookId: string, on: boolean): void {
  if (!ID_RE.test(bookId)) return;
  const current = getSnapshot().favorites;
  if (current.some((f) => f.bookId === bookId) === on) return;
  mutations += 1;
  const favorites = on
    ? normalizeFavorites([{ bookId, createdAt: new Date().toISOString() }, ...current])
    : current.filter((f) => f.bookId !== bookId);
  commit({ favorites });
  void send({ type: "favorite", bookId, on });
}

/** Returns the new state. */
export function toggleFavorite(bookId: string): boolean {
  const next = !isFavoriteBook(bookId);
  setFavorite(bookId, next);
  return next;
}

export function getProgressFor(bookId: string): LocalProgress | undefined {
  return getSnapshot().progress.find((p) => p.bookId === bookId);
}

const PROGRESS_DELAY_MS = 1500;
const progressTimers = new Map<string, ReturnType<typeof setTimeout>>();

function flushProgressTimers(): void {
  for (const [bookId, timer] of progressTimers) {
    clearTimeout(timer);
    const item = getProgressFor(bookId);
    if (item) void send({ type: "progress", item }, true);
  }
  progressTimers.clear();
}

/**
 * Remembers where the reader is. Call it on every page turn; the device copy
 * is updated at once and the server (when signed in) shortly after.
 * `pageIndex` is zero-based. Pass `completed: true` on the last page.
 */
export function saveProgress(bookId: string, pageIndex: number, completed?: boolean): void {
  if (!ID_RE.test(bookId) || !Number.isFinite(pageIndex)) return;
  const existing = getProgressFor(bookId);
  const index = Math.max(0, Math.floor(pageIndex));
  if (existing && existing.pageIndex === index && (completed === undefined || completed === existing.completed)) {
    return;
  }
  mutations += 1;
  commit({
    progress: applyProgress(getSnapshot().progress, bookId, index, completed, new Date().toISOString()),
  });
  if (!getSnapshot().ownerId) return;
  const pendingTimer = progressTimers.get(bookId);
  if (pendingTimer) clearTimeout(pendingTimer);
  progressTimers.set(
    bookId,
    setTimeout(() => {
      progressTimers.delete(bookId);
      const item = getProgressFor(bookId);
      if (item) void send({ type: "progress", item });
    }, PROGRESS_DELAY_MS),
  );
}

/** Forgets the favorites, progress and queued changes kept on this device. The account is untouched. */
export function clearDevicePersonalData(): void {
  writeRaw(PENDING_KEY, null);
  for (const key of readerKeys()) writeRaw(key, null);
  commit({ favorites: [], progress: [], ownerId: "" });
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

interface ServerState {
  favorites: LocalFavorite[];
  progress: LocalProgress[];
}

async function fetchServerState(): Promise<ServerState | null> {
  try {
    const [favoritesResponse, progressResponse] = await Promise.all([
      fetch("/api/favorites", { cache: "no-store" }),
      fetch("/api/progress", { cache: "no-store" }),
    ]);
    if (!favoritesResponse.ok || !progressResponse.ok) return null;
    const favoritesBody = (await favoritesResponse.json()) as { favorites?: unknown };
    const progressBody = (await progressResponse.json()) as { progress?: unknown };
    return {
      favorites: normalizeFavorites(
        Array.isArray(favoritesBody.favorites) ? favoritesBody.favorites.filter(isFavorite) : [],
      ).map(({ bookId, createdAt }) => ({ bookId, createdAt })),
      progress: normalizeProgress(
        Array.isArray(progressBody.progress) ? progressBody.progress.filter(isProgress) : [],
      ).map(({ bookId, pageIndex, completed, updatedAt }) => ({ bookId, pageIndex, completed, updatedAt })),
    };
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Sends anonymous device data to the account. */
async function mergeAnonymous(data: PersonalSnapshot): Promise<boolean> {
  if (data.favorites.length > 0) {
    if (!(await postJson("/api/favorites", { bookIds: data.favorites.map((f) => f.bookId) }))) return false;
  }
  if (data.progress.length > 0) {
    if (!(await postJson("/api/progress", { items: data.progress }))) return false;
  }
  return true;
}

export interface SyncResult {
  status: SyncStatus;
  /** True when the device data was cleared because the user signed out or changed. */
  cleared: boolean;
  /** Number of anonymous favorites and positions that were merged into the account. */
  merged: number;
}

let inFlight: { userId: string | null; promise: Promise<SyncResult> } | null = null;

/** Reconciles the device copy with the account of `userId` (null = signed out). Safe to call often. */
export function syncPersonal(userId: string | null): Promise<SyncResult> {
  if (typeof window === "undefined") return Promise.resolve({ status: "idle", cleared: false, merged: 0 });
  if (inFlight && inFlight.userId === userId) return inFlight.promise;
  const promise = runSync(userId).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { userId, promise };
  return promise;
}

async function runSync(userId: string | null): Promise<SyncResult> {
  load();
  let cleared = false;
  let merged = 0;
  const owner = snapshot.ownerId;

  if (!userId) {
    if (owner) {
      // The page says "signed out", but a page stored for offline use always says
      // that. Ask the server before forgetting anything: only a clear 401 counts.
      let signedOut = false;
      try {
        signedOut = (await fetch("/api/favorites", { cache: "no-store" })).status === 401;
      } catch {
        // no network: keep the device copy
      }
      if (!signedOut) {
        setStatus("idle");
        return { status: "idle", cleared, merged };
      }
      // Data that mirrored an account does not stay on a shared device.
      clearDevicePersonalData();
      cleared = true;
    }
    setStatus("synced");
    return { status: "synced", cleared, merged };
  }

  if (owner && owner !== userId) {
    clearDevicePersonalData();
    cleared = true;
  }

  setStatus("syncing");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = mutations;
    const current = getSnapshot();

    if (current.ownerId === userId) {
      await flushPending();
      // Positions the reader saved on this device that the account has not seen
      // (for example a page turned without a network). The server keeps the newer one.
      const known = new Map(readOwnProgress().map((p) => [p.bookId, p.updatedAt]));
      const unseen = readReaderProgress().filter((p) => p.updatedAt > (known.get(p.bookId) ?? ""));
      if (unseen.length > 0) await postJson("/api/progress", { items: unseen.slice(0, MAX_ITEMS) });
    } else {
      const count = current.favorites.length + current.progress.length;
      if (count > 0) {
        if (!(await mergeAnonymous(current))) {
          setStatus("error");
          return { status: "error", cleared, merged };
        }
        merged += count;
      }
    }

    const server = await fetchServerState();
    if (!server) {
      setStatus("error");
      return { status: "error", cleared, merged };
    }
    // Something changed on the device while we were talking to the server:
    // go round once more so that change is not overwritten.
    if (mutations !== startedAt && attempt === 0) continue;

    status = "synced";
    commit({ favorites: server.favorites, progress: server.progress, ownerId: userId });
    return { status: "synced", cleared, merged };
  }
  setStatus("error");
  return { status: "error", cleared, merged };
}

/** Test hook: forget the in-memory snapshot so the next read comes from storage. */
export function resetPersonalStoreForTests(): void {
  snapshot = EMPTY;
  status = "idle";
  mutations = 0;
  inFlight = null;
  for (const timer of progressTimers.values()) clearTimeout(timer);
  progressTimers.clear();
}
