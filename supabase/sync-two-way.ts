/**
 * Two-way sync between the local library (./data) and Supabase, including
 * deletions in both directions.
 *
 *   npx tsx --env-file=.env.supabase supabase/sync-two-way.ts [--dry-run] [--yes]
 *
 * How it tells "new" from "deleted": the state file data/.supabase-sync-state.json
 * remembers, per book, the content hash on each side right after the last sync.
 *
 *   local changed only   -> push to Supabase
 *   Supabase changed only-> pull to local
 *   both changed         -> the one with the later updatedAt wins (listed in the plan)
 *   in state, gone local -> deleted locally   -> delete in Supabase
 *   in state, gone remote-> deleted in Supabase -> delete locally (backed up first)
 *   not in state         -> new: copied to the other side
 *
 * Scope: published and private books, plus any book that already exists on both
 * sides. Local drafts stay local; Supabase drafts that are not local are ignored;
 * books owned by a real user (not the site library) are never pulled or deleted.
 *
 * First run (no state file): needs --bootstrap-since <ISO time> = when the two
 * sides last matched. A book missing on one side is then treated as "deleted"
 * if the side that still has it last changed it before that time, and as "new"
 * otherwise.
 *
 * Deleted local books are copied to data/.sync-trash/<time>/ first.
 * Safety: refuses more than --max-deletes (default 30) deletions per side.
 * Never touched: users, favorites, ratings, progress, recordings, jobs, viewCount.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { bookMediaPrefix, contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import type { BookPatch, Repository } from "../src/lib/repo/types";
import type { MediaStore } from "../src/lib/media/types";
import { SYSTEM_OWNER_ID, type BookWithPages, type Collection } from "../src/lib/types";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = flag("--dry-run");
const ASSUME_YES = flag("--yes");
const MAX_DELETES = Number(value("--max-deletes") ?? 30);
const BOOTSTRAP_SINCE = value("--bootstrap-since");

const STATE_FILE = path.join(dataDir(), ".supabase-sync-state.json");
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "viewCount"]);

interface Pair {
  local: string;
  remote: string;
}
interface State {
  syncedAt: string;
  books: Record<string, Pair>;
  collections: Record<string, Pair>;
  bookOfTheWeek?: Pair;
}

// --- helpers -----------------------------------------------------------------------

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .filter(([, y]) => y !== undefined && y !== null)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return x;
  });
}
const hash = (v: unknown) => createHash("sha1").update(stable(v)).digest("hex");

function bookContent(book: BookWithPages): Record<string, unknown> {
  return Object.fromEntries(Object.entries(book).filter(([k]) => !IGNORED_FIELDS.has(k)));
}
const bookHash = (b: BookWithPages) => hash(bookContent(b));

function changedFields(from: BookWithPages, to: BookWithPages): string[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  return [...keys].filter((k) => {
    if (IGNORED_FIELDS.has(k) || k === "pages") return false;
    return stable((from as never)[k]) !== stable((to as never)[k]);
  });
}

async function retry<T>(fn: () => Promise<T>, attempts = 10): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function lines(items: string[], max = 25): string {
  const shown = items.slice(0, max).map((l) => `      ${l}`);
  if (items.length > max) shown.push(`      … and ${items.length - max} more`);
  return shown.join("\n");
}

async function readState(): Promise<State | null> {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8")) as State;
  } catch {
    return null;
  }
}

// --- plan --------------------------------------------------------------------------

type Action =
  | { kind: "push"; book: BookWithPages; existing: BookWithPages | null; why: string }
  | { kind: "pull"; book: BookWithPages; existing: BookWithPages | null; why: string }
  | { kind: "deleteRemote"; book: BookWithPages; why: string }
  | { kind: "deleteLocal"; book: BookWithPages; why: string };

const inScope = (b: BookWithPages) => b.status === "published" || b.status === "private";

async function main(): Promise<void> {
  const state = await readState();
  if (!state && !BOOTSTRAP_SINCE) {
    throw new Error(
      "No sync state yet. Run once with --bootstrap-since <ISO time of the last time both sides matched>, " +
        "e.g. --bootstrap-since 2026-11-05T00:22:00+02:00",
    );
  }
  const since = !state && BOOTSTRAP_SINCE ? Date.parse(BOOTSTRAP_SINCE) : null;
  if (since !== null && Number.isNaN(since)) throw new Error(`Bad --bootstrap-since: ${BOOTSTRAP_SINCE}`);

  const local: Repository = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();

  console.log("Reading local and Supabase libraries…");
  const localBooks = new Map((await local.listAllBooksWithPages()).map((b) => [b.id, b]));
  const remoteBooks = new Map((await remote.listAllBooksWithPages()).map((b) => [b.id, b]));

  const actions: Action[] = [];
  const notes: string[] = [];
  let same = 0;

  for (const id of new Set([...localBooks.keys(), ...remoteBooks.keys()])) {
    const l = localBooks.get(id);
    const r = remoteBooks.get(id);
    const known = state?.books[id];

    if (l && r) {
      if (r.ownerId !== SYSTEM_OWNER_ID && l.ownerId !== r.ownerId) continue;
      const lh = bookHash(l);
      const rh = bookHash(r);
      if (lh === rh) {
        same++;
        continue;
      }
      // First run: a side counts as changed when it was edited after the bootstrap time.
      // Local is the master, so a difference nobody edited since is resolved in favor of local.
      const localChanged = known ? known.local !== lh : Date.parse(l.updatedAt) > (since ?? 0);
      const remoteChanged = known ? known.remote !== rh : Date.parse(r.updatedAt) > (since ?? 0);
      if (!known && !remoteChanged) actions.push({ kind: "push", book: l, existing: r, why: "differs (local is master)" });
      else if (localChanged && !remoteChanged) actions.push({ kind: "push", book: l, existing: r, why: "changed locally" });
      else if (remoteChanged && !localChanged) actions.push({ kind: "pull", book: r, existing: l, why: "changed in Supabase" });
      else {
        const localWins = Date.parse(l.updatedAt) >= Date.parse(r.updatedAt);
        actions.push({
          kind: localWins ? "push" : "pull",
          book: localWins ? l : r,
          existing: localWins ? r : l,
          why: known ? "changed on both sides, newer wins" : "differs, newer wins",
        });
      }
      continue;
    }

    if (l && !r) {
      if (!inScope(l)) continue; // local draft: stays local
      const deletedRemote = known ? true : since !== null && Date.parse(l.updatedAt) < since;
      if (deletedRemote) actions.push({ kind: "deleteLocal", book: l, why: "deleted in Supabase" });
      else actions.push({ kind: "push", book: l, existing: null, why: "new locally" });
      continue;
    }

    if (r && !l) {
      if (r.ownerId !== SYSTEM_OWNER_ID) {
        notes.push(`kept ${id} "${r.title}": user book that exists only in Supabase`);
        continue;
      }
      if (!inScope(r)) continue; // Supabase draft not present locally
      const deletedLocal = known ? true : since !== null && Date.parse(r.updatedAt) < since;
      if (deletedLocal) actions.push({ kind: "deleteRemote", book: r, why: "deleted locally" });
      else actions.push({ kind: "pull", book: r, existing: null, why: "new in Supabase" });
    }
  }

  // Collections and book of the week.
  const localCols = new Map((await local.listCollections()).map((c) => [c.id, c]));
  const remoteCols = new Map((await remote.listCollections()).map((c) => [c.id, c]));
  const colOps: { kind: string; label: string; run: () => Promise<void> }[] = [];
  const strip = (c: Collection) => stable(c);
  for (const id of new Set([...localCols.keys(), ...remoteCols.keys()])) {
    const l = localCols.get(id);
    const r = remoteCols.get(id);
    const known = state?.collections[id];
    if (l && r) {
      if (strip(l) === strip(r)) continue;
      const lh = hash(l);
      const rh = hash(r);
      const localChanged = known ? known.local !== lh : true;
      const remoteChanged = known ? known.remote !== rh : true;
      // No timestamps on collections: when both changed, local wins.
      if (localChanged || !remoteChanged) {
        const { id: _i, ...patch } = l;
        colOps.push({ kind: "push", label: `collection "${l.title}"`, run: async () => void (await remote.updateCollection(id, patch)) });
      } else {
        const { id: _i, ...patch } = r;
        colOps.push({ kind: "pull", label: `collection "${r.title}"`, run: async () => void (await local.updateCollection(id, patch)) });
      }
    } else if (l) {
      if (known) colOps.push({ kind: "deleteLocal", label: `collection "${l.title}"`, run: () => local.deleteCollection(id) });
      else colOps.push({ kind: "push", label: `new collection "${l.title}"`, run: async () => void (await remote.createCollection(l)) });
    } else if (r) {
      if (known) colOps.push({ kind: "deleteRemote", label: `collection "${r.title}"`, run: () => remote.deleteCollection(id) });
      else colOps.push({ kind: "pull", label: `new collection "${r.title}"`, run: async () => void (await local.createCollection(r)) });
    }
  }

  const lSettings = await local.getSettings();
  const rSettings = await remote.getSettings();
  let settingsOp: { label: string; run: () => Promise<void> } | null = null;
  if (lSettings.bookOfTheWeekId !== rSettings.bookOfTheWeekId) {
    const known = state?.bookOfTheWeek;
    const lh = hash(lSettings.bookOfTheWeekId ?? "");
    const rh = hash(rSettings.bookOfTheWeekId ?? "");
    const remoteOnly = known ? known.local === lh && known.remote !== rh : false;
    if (remoteOnly && rSettings.bookOfTheWeekId) {
      settingsOp = {
        label: `book of the week (Supabase → local) ${rSettings.bookOfTheWeekId}`,
        run: async () => void (await local.setSettings({ bookOfTheWeekId: rSettings.bookOfTheWeekId })),
      };
    } else if (lSettings.bookOfTheWeekId) {
      settingsOp = {
        label: `book of the week (local → Supabase) ${lSettings.bookOfTheWeekId}`,
        run: async () => void (await remote.setSettings({ bookOfTheWeekId: lSettings.bookOfTheWeekId })),
      };
    }
  }

  // --- show the plan ---------------------------------------------------------------
  const by = (k: Action["kind"]) => actions.filter((a) => a.kind === k);
  const label = (a: Action) => `${a.book.id} "${a.book.title}" [${a.book.status}] — ${a.why}`;
  console.log(`\n=== Plan: two-way sync${state ? "" : " (first run, bootstrap)"} ===\n`);
  console.log(`Books: ${localBooks.size} local, ${remoteBooks.size} in Supabase, ${same} already identical`);
  for (const [kind, title] of [
    ["push", "local → Supabase (create/update)"],
    ["pull", "Supabase → local (create/update)"],
    ["deleteRemote", "DELETE in Supabase (deleted locally)"],
    ["deleteLocal", "DELETE locally (deleted in Supabase; backed up first)"],
  ] as const) {
    const items = by(kind);
    console.log(`  ${title}: ${items.length}`);
    if (items.length) {
      console.log(
        lines(
          items.map((a) => {
            if ((a.kind === "push" || a.kind === "pull") && a.existing) {
              const f = changedFields(a.kind === "push" ? a.existing : a.existing, a.book);
              return `${label(a)}${f.length ? ` (fields: ${f.join(", ")})` : " (pages/media)"}`;
            }
            return label(a);
          }),
          40,
        ),
      );
    }
  }
  if (colOps.length) {
    console.log(`\nCollections: ${colOps.length}`);
    console.log(lines(colOps.map((c) => `${c.kind}: ${c.label}`)));
  }
  if (settingsOp) console.log(`\n${settingsOp.label}`);
  if (notes.length) console.log(`\nNotes:\n${lines(notes)}`);

  const deleteRemote = by("deleteRemote").length;
  const deleteLocal = by("deleteLocal").length;
  if (deleteRemote > MAX_DELETES || deleteLocal > MAX_DELETES) {
    throw new Error(`Refusing: ${deleteRemote} remote / ${deleteLocal} local deletions exceed --max-deletes ${MAX_DELETES}.`);
  }
  if (actions.length + colOps.length + (settingsOp ? 1 : 0) === 0) {
    console.log("\nNothing to do: both sides already match.");
    if (!DRY_RUN) await saveState(local, remote, localCols, remoteCols);
    return;
  }
  if (DRY_RUN) {
    console.log("\nDry run: nothing was changed.");
    return;
  }
  if (!ASSUME_YES && !(await confirm('\nApply? Type "yes" to continue: '))) {
    console.log("Cancelled.");
    return;
  }

  // --- apply -----------------------------------------------------------------------
  const copyMedia = async (id: string, from: MediaStore, to: MediaStore) => {
    const prefix = bookMediaPrefix(id);
    const fromPaths = await retry(() => from.list(prefix));
    const toPaths = new Set(await retry(() => to.list(prefix)));
    for (const p of fromPaths) {
      if (toPaths.has(p)) continue;
      const obj = await from.get(p);
      if (obj) await retry(() => to.put(p, obj.bytes, contentTypeForPath(p)));
    }
    const fromSet = new Set(fromPaths);
    for (const p of toPaths) if (!fromSet.has(p)) await retry(() => to.delete(p));
  };

  const trash = path.join(dataDir(), ".sync-trash", new Date().toISOString().replace(/[:.]/g, "-"));
  const writeBook = async (repo: Repository, a: Action & { kind: "push" | "pull" }) => {
    const book = a.book;
    if (!a.existing) {
      const { createdAt: _c, updatedAt: _u, ...input } = book;
      await retry(() => repo.createBook(input));
      return;
    }
    const fields = changedFields(a.existing, book);
    if (fields.length) {
      const patch: Record<string, unknown> = {};
      for (const k of fields) patch[k] = (book as never)[k];
      await retry(() => repo.updateBook(book.id, patch as BookPatch));
    }
    await retry(() => repo.replacePages(book.id, book.pages));
  };

  for (const a of actions) {
    if (a.kind === "push") {
      await copyMedia(a.book.id, localMedia, remoteMedia);
      await writeBook(remote, a);
    } else if (a.kind === "pull") {
      await copyMedia(a.book.id, remoteMedia, localMedia);
      await writeBook(local, a);
    }
    if (a.kind === "push" || a.kind === "pull") console.log(`${a.kind} ${a.book.id}`);
  }
  for (const a of by("deleteRemote")) {
    await retry(() => remote.deleteBook(a.book.id));
    await retry(() => remoteMedia.deletePrefix(bookMediaPrefix(a.book.id)));
    console.log(`deleted in Supabase ${a.book.id}`);
  }
  for (const a of by("deleteLocal")) {
    const book = a.book;
    await mkdir(path.join(trash, "books"), { recursive: true });
    await cp(path.join(dataDir(), "books", book.slug), path.join(trash, "books", book.slug), { recursive: true }).catch(() => {});
    await cp(path.join(dataDir(), "media", bookMediaPrefix(book.id)), path.join(trash, "media", bookMediaPrefix(book.id)), {
      recursive: true,
    }).catch(() => {});
    await local.deleteBook(book.id);
    await localMedia.deletePrefix(bookMediaPrefix(book.id));
    console.log(`deleted locally ${book.id} (backup: ${trash})`);
  }
  for (const c of colOps) {
    await retry(c.run);
    console.log(`${c.kind} ${c.label}`);
  }
  if (settingsOp) await retry(settingsOp.run);

  const finalLocalCols = new Map((await local.listCollections()).map((c) => [c.id, c]));
  const finalRemoteCols = new Map((await remote.listCollections()).map((c) => [c.id, c]));
  await saveState(local, remote, finalLocalCols, finalRemoteCols);
  console.log("\nDone. Both sides are in sync; state saved.");
}

/** Records the hashes of both sides as they are now (called after a sync, or when nothing differed). */
async function saveState(
  local: Repository,
  remote: Repository,
  localCols: Map<string, Collection>,
  remoteCols: Map<string, Collection>,
): Promise<void> {
  const lb = new Map((await local.listAllBooksWithPages()).map((b) => [b.id, b]));
  const rb = new Map((await remote.listAllBooksWithPages()).map((b) => [b.id, b]));
  const books: Record<string, Pair> = {};
  // Only books present on both sides are "known": a book on one side only stays unknown.
  for (const [id, l] of lb) {
    const r = rb.get(id);
    if (r) books[id] = { local: bookHash(l), remote: bookHash(r) };
  }
  const collections: Record<string, Pair> = {};
  for (const [id, l] of localCols) {
    const r = remoteCols.get(id);
    if (r) collections[id] = { local: hash(l), remote: hash(r) };
  }
  const ls = await local.getSettings();
  const rs = await remote.getSettings();
  const state: State = {
    syncedAt: new Date().toISOString(),
    books,
    collections,
    bookOfTheWeek: { local: hash(ls.bookOfTheWeekId ?? ""), remote: hash(rs.bookOfTheWeekId ?? "") },
  };
  await writeFile(STATE_FILE, JSON.stringify(state, null, 1), "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
