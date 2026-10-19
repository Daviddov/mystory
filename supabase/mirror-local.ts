/**
 * Makes a Supabase project an exact mirror of the local library (./data):
 * books, pages, collections, the book of the week and media files. Unlike
 * import-local.ts it also UPDATES books that already exist and DELETES
 * books / media that no longer exist locally.
 *
 *   npx tsx supabase/mirror-local.ts              show the plan, then ask to apply
 *   npx tsx supabase/mirror-local.ts --dry-run    show the plan only
 *   npx tsx supabase/mirror-local.ts --yes        apply without asking
 *
 *   --no-delete   never delete anything in Supabase (only add / update)
 *   --deep        also compare the bytes of media files that exist on both
 *                 sides (downloads every remote file; slow)
 *
 * Not touched: users, favorites, ratings, progress, recordings, jobs, and
 * viewCount (Supabase keeps its own counter).
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { createInterface } from "node:readline/promises";
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { bookMediaPrefix, contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import type { BookPatch } from "../src/lib/repo/types";
import type { BookWithPages } from "../src/lib/types";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const ASSUME_YES = args.has("--yes");
const NO_DELETE = args.has("--no-delete");
const DEEP = args.has("--deep");

/** Fields the mirror never compares or writes. */
const IGNORED_BOOK_FIELDS = new Set(["id", "createdAt", "updatedAt", "viewCount", "pages"]);

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return v;
  });
}

function changedBookFields(local: BookWithPages, remote: BookWithPages): string[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (IGNORED_BOOK_FIELDS.has(key)) continue;
    const a = (local as unknown as Record<string, unknown>)[key];
    const b = (remote as unknown as Record<string, unknown>)[key];
    if (stable(a) !== stable(b)) changed.push(key);
  }
  return changed;
}

function changedPageIndexes(local: BookWithPages, remote: BookWithPages): number[] {
  const out: number[] = [];
  const n = Math.max(local.pages.length, remote.pages.length);
  for (let i = 0; i < n; i++) {
    if (stable(local.pages[i]) !== stable(remote.pages[i])) out.push(i + 1);
  }
  return out;
}

interface BookUpdate {
  local: BookWithPages;
  fields: string[];
  pages: number[];
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function listLimited(lines: string[], max = 15): string {
  const shown = lines.slice(0, max).map((l) => `      ${l}`);
  if (lines.length > max) shown.push(`      … and ${lines.length - max} more`);
  return shown.join("\n");
}

async function main(): Promise<void> {
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();

  console.log("Reading local and Supabase libraries…");
  const localBooks = new Map((await local.listAllBooksWithPages()).map((b) => [b.id, b]));
  const remoteBooks = new Map((await remote.listAllBooksWithPages()).map((b) => [b.id, b]));

  // --- books ---------------------------------------------------------------------
  const toCreate: BookWithPages[] = [];
  const toUpdate: BookUpdate[] = [];
  let same = 0;
  for (const book of localBooks.values()) {
    const existing = remoteBooks.get(book.id);
    if (!existing) {
      toCreate.push(book);
      continue;
    }
    const fields = changedBookFields(book, existing);
    const pages = changedPageIndexes(book, existing);
    if (fields.length || pages.length) toUpdate.push({ local: book, fields, pages });
    else same++;
  }
  const toDelete = NO_DELETE ? [] : [...remoteBooks.values()].filter((b) => !localBooks.has(b.id));

  // --- media ---------------------------------------------------------------------
  const mediaUpload: string[] = [];
  const mediaDelete: string[] = [];
  const mediaChanged: string[] = [];
  let mediaSame = 0;
  for (const book of localBooks.values()) {
    const prefix = bookMediaPrefix(book.id);
    const localPaths = await localMedia.list(prefix);
    const remotePaths = new Set(await remoteMedia.list(prefix));
    for (const path of localPaths) {
      if (!remotePaths.has(path)) {
        mediaUpload.push(path);
        continue;
      }
      if (DEEP) {
        const [a, b] = await Promise.all([localMedia.get(path), remoteMedia.get(path)]);
        if (a && (!b || a.size !== b.size || Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes)) !== 0)) {
          mediaChanged.push(path);
          continue;
        }
      }
      mediaSame++;
    }
    if (!NO_DELETE) {
      const localSet = new Set(localPaths);
      for (const path of remotePaths) if (!localSet.has(path)) mediaDelete.push(path);
    }
  }

  // --- collections & settings ----------------------------------------------------
  const localCollections = new Map((await local.listCollections()).map((c) => [c.id, c]));
  const remoteCollections = new Map((await remote.listCollections()).map((c) => [c.id, c]));
  const stripCollection = (c: object) => {
    const { createdAt: _c, updatedAt: _u, ...rest } = c as Record<string, unknown>;
    return rest;
  };
  const collCreate = [...localCollections.values()].filter((c) => !remoteCollections.has(c.id));
  const collUpdate = [...localCollections.values()].filter((c) => {
    const r = remoteCollections.get(c.id);
    return r && stable(stripCollection(c)) !== stable(stripCollection(r));
  });
  const collDelete = NO_DELETE ? [] : [...remoteCollections.values()].filter((c) => !localCollections.has(c.id));

  const localSettings = await local.getSettings();
  const remoteSettings = await remote.getSettings();
  const settingsChange =
    localSettings.bookOfTheWeekId && localSettings.bookOfTheWeekId !== remoteSettings.bookOfTheWeekId
      ? localSettings.bookOfTheWeekId
      : null;

  // --- plan ----------------------------------------------------------------------
  console.log("\n=== Plan: make Supabase match local ===\n");
  console.log(`Books: ${localBooks.size} local, ${remoteBooks.size} in Supabase, ${same} already identical`);
  console.log(`  + create  ${toCreate.length}`);
  if (toCreate.length) console.log(listLimited(toCreate.map((b) => `${b.id} "${b.title}" (${b.pages.length} pages)`)));
  console.log(`  ~ update  ${toUpdate.length}`);
  if (toUpdate.length) {
    console.log(
      listLimited(
        toUpdate.map((u) => {
          const parts = [];
          if (u.fields.length) parts.push(`fields: ${u.fields.join(", ")}`);
          if (u.pages.length) parts.push(`pages: ${u.pages.join(",")}`);
          return `${u.local.id} "${u.local.title}" — ${parts.join("; ")}`;
        }),
        40,
      ),
    );
  }
  console.log(`  - DELETE  ${toDelete.length}${NO_DELETE ? " (skipped: --no-delete)" : ""}`);
  if (toDelete.length) {
    console.log(listLimited(toDelete.map((b) => `${b.id} "${b.title}" [${b.status}, owner ${b.ownerId}]`), 40));
  }
  console.log(`\nMedia: ${mediaSame} identical`);
  console.log(`  + upload  ${mediaUpload.length}`);
  if (mediaUpload.length) console.log(listLimited(mediaUpload));
  console.log(`  ~ replace ${mediaChanged.length}${DEEP ? "" : " (not checked; use --deep)"}`);
  if (mediaChanged.length) console.log(listLimited(mediaChanged));
  console.log(`  - DELETE  ${mediaDelete.length} files in books that exist locally` +
    (toDelete.length ? `, plus every file of the ${toDelete.length} deleted book(s)` : ""));
  if (mediaDelete.length) console.log(listLimited(mediaDelete));
  console.log(`\nCollections: +${collCreate.length} create, ~${collUpdate.length} update, -${collDelete.length} DELETE`);
  if (settingsChange) console.log(`Book of the week → ${settingsChange}`);

  const total =
    toCreate.length + toUpdate.length + toDelete.length + mediaUpload.length + mediaChanged.length +
    mediaDelete.length + collCreate.length + collUpdate.length + collDelete.length + (settingsChange ? 1 : 0);
  if (total === 0) {
    console.log("\nSupabase already matches local. Nothing to do.");
    return;
  }
  if (DRY_RUN) {
    console.log("\nDry run: nothing was changed.");
    return;
  }
  if (!ASSUME_YES && !(await confirm('\nApply these changes to Supabase? Type "yes" to continue: '))) {
    console.log("Cancelled. Nothing was changed.");
    return;
  }

  // --- apply: add first, delete last ---------------------------------------------
  const putMedia = async (paths: string[]) => {
    for (const path of paths) {
      const object = await localMedia.get(path);
      if (!object) continue;
      await remoteMedia.put(path, object.bytes, contentTypeForPath(path));
    }
  };
  await putMedia([...mediaUpload, ...mediaChanged]);
  console.log(`uploaded ${mediaUpload.length + mediaChanged.length} media files`);

  for (const book of toCreate) {
    const { createdAt: _c, updatedAt: _u, ...input } = book;
    await remote.createBook(input);
    console.log(`created ${book.id}`);
  }
  for (const { local: book, fields, pages } of toUpdate) {
    if (fields.length) {
      const patch: Record<string, unknown> = {};
      for (const key of fields) patch[key] = (book as unknown as Record<string, unknown>)[key];
      await remote.updateBook(book.id, patch as BookPatch);
    }
    if (pages.length) await remote.replacePages(book.id, book.pages);
    console.log(`updated ${book.id}`);
  }
  for (const book of toDelete) {
    await remote.deleteBook(book.id);
    await remoteMedia.deletePrefix(bookMediaPrefix(book.id));
    console.log(`deleted ${book.id}`);
  }
  for (const path of mediaDelete) await remoteMedia.delete(path);

  for (const c of collCreate) await remote.createCollection(c);
  for (const c of collUpdate) {
    const { id, ...patch } = c;
    await remote.updateCollection(id, patch);
  }
  for (const c of collDelete) await remote.deleteCollection(c.id);
  if (settingsChange) await remote.setSettings({ bookOfTheWeekId: settingsChange });

  console.log("\nDone. Supabase now mirrors the local library.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
