/**
 * Imports free picture books from Let's Read (The Asia Foundation; CC BY 4.0 and CC0 only) as English drafts.
 *
 *   npm run import:letsread -- --list                 show the English catalogue and what is already imported
 *   npm run import:letsread -- <id> [<id> ...]        import these books (the id Let's Read calls masterBookId, see --list)
 *   npm run import:letsread -- --all                  import every importable book of the catalogue
 *     --limit <n>       with --all: stop after n books were imported (most of the
 *                       catalogue is refused, see below). With --list: the first n lines.
 *     --owner <email>   the user who will own the drafts (created when missing).
 *                       Default: the library owner ("system"), whose books
 *                       every editor and admin can open in the studio.
 *     --force           import again and REPLACE the existing copy, including
 *                       its translation, narration and edits
 *
 * A book that was imported before is skipped (found by its Let's Read id). The
 * drafts stay in English until someone translates them in the studio.
 *
 * Refused, and counted apart from failures:
 *   - every license but CC BY 4.0 and CC0. The record is not trusted alone:
 *     the book's own attribution page (in its EPUB) must state the same license.
 *   - a book whose title, or original title, is in the library already under
 *     another id: many Let's Read books arrived through the Global Digital Library.
 *   - with --all, the publishers of LETSREAD_SKIPPED_PUBLISHERS (Book Dash,
 *     StoryWeaver / Pratham Books, African Storybook), whose books are imported
 *     from their own sources. A book of theirs named by its id is imported.
 *   - books whose pages are pictures without separate text.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data). tsx does not read .env.local, so
 * export the variables in the shell first.
 */
import path from "node:path";
import {
  LETSREAD_SKIPPED_PUBLISHERS,
  LetsReadClient,
  LetsReadError,
  findLetsReadBook,
  importLetsReadBook,
  letsReadCatalogueProblem,
  letsReadKnownTitles,
  letsReadTitleKey,
  type LetsReadErrorCode,
} from "../src/lib/importers/letsread";
import { LocalMediaStore } from "../src/lib/media/local";
import type { MediaStore } from "../src/lib/media/types";
import { LocalRepository } from "../src/lib/repo/local";
import type { Repository } from "../src/lib/repo/types";
import { bookLanguage, SYSTEM_OWNER_ID } from "../src/lib/types";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

const USAGE = "usage: tsx scripts/import-letsread.ts <id> [...] | --all | --list  [--limit <n>] [--owner <email>] [--force]";

/** Pause between books, so a full import is gentle on Let's Read's servers. */
const PAUSE_MS = 500;

/** A book the importer will not take, as opposed to one it could not download. */
const REFUSALS: readonly LetsReadErrorCode[] = ["license", "publisher", "duplicate", "no-text", "invalid-book"];

async function openStorage(): Promise<{ repo: Repository; media: MediaStore; label: string }> {
  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    const [{ createSupabaseRepository }, { createSupabaseMediaStore }] = await Promise.all([
      import("../src/lib/repo/supabase"),
      import("../src/lib/media/supabase"),
    ]);
    return {
      repo: await createSupabaseRepository(),
      media: await createSupabaseMediaStore(),
      label: `Supabase (${env("NEXT_PUBLIC_SUPABASE_URL")})`,
    };
  }
  const dataDirOverride = env("DATA_DIR");
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  return { repo: new LocalRepository(root), media: new LocalMediaStore(root), label: root };
}

async function resolveOwner(repo: Repository, email: string | undefined): Promise<{ id: string; label: string }> {
  if (!email) return { id: SYSTEM_OWNER_ID, label: `${SYSTEM_OWNER_ID} (the library owner)` };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`--owner needs an email address, got "${email}"`);
  const existing = await repo.getUserByEmail(email);
  if (existing) return { id: existing.id, label: `${existing.name} <${email}> (${existing.role})` };
  if (repo.kind === "supabase") {
    throw new Error(`no user with the email ${email}. With Supabase the user must sign in to the site once first.`);
  }
  const created = await repo.upsertUser({ name: email.split("@")[0], email });
  return { id: created.id, label: `${created.name} <${email}> (new local user, role ${created.role})` };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const all = args.includes("--all");
  const list = args.includes("--list");
  let ownerEmail: string | undefined;
  let limit = Infinity;
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--owner") {
      ownerEmail = args[++i];
      if (!ownerEmail) throw new Error("--owner needs an email address");
    } else if (arg === "--limit") {
      limit = Number(args[++i]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit needs a positive number");
    } else if (arg.startsWith("--")) {
      if (!["--force", "--all", "--list"].includes(arg)) throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else ids.push(arg.replace(/^letsread-/i, "").toLowerCase());
  }
  if (!all && !list && ids.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const { repo, media, label } = await openStorage();
  const client = new LetsReadClient();
  console.log(`storage: ${label}`);
  // Read again before every book: other importers may be adding books at the same time.
  const knownTitles = () => letsReadKnownTitles(repo);

  if (list) {
    const titles = await knownTitles();
    const entries = (await client.catalogue()).slice(0, limit);
    for (const entry of entries) {
      const local = await findLetsReadBook(repo, entry.id);
      const twin = titles.get(letsReadTitleKey(entry.title));
      const state = local
        ? `imported (${local.status}, ${bookLanguage(local)})`
        : (letsReadCatalogueProblem(entry) ?? (twin ? `title in the library (${twin})` : "-"));
      console.log(`${entry.id} ${state.slice(0, 40).padEnd(40)} L${entry.level || "?"} ${String(entry.pages).padStart(2)}p ${entry.license.padEnd(16)} ${entry.title}`);
    }
    console.log(`\n${entries.length} books in English. "-" may be importable: the book's own attribution page and its publisher decide.`);
    return;
  }

  const owner = await resolveOwner(repo, ownerEmail);
  console.log(`owner:   ${owner.label}`);
  // --all leaves out what the catalogue already rules out: the other licenses.
  const targets = all ? (await client.catalogue()).filter((entry) => !letsReadCatalogueProblem(entry)).map((entry) => entry.id) : ids;
  if (all) console.log(`skipping the publishers: ${LETSREAD_SKIPPED_PUBLISHERS.map((publisher) => publisher.name).join(", ")}`);

  let failed = 0;
  let refused = 0;
  let created = 0;
  let tried = 0;
  for (const id of targets) {
    if (all && created >= limit) break;
    tried += 1;
    console.log(`\n${id}`);
    try {
      const result = await importLetsReadBook({
        id,
        ownerId: owner.id,
        repo,
        media,
        client,
        force,
        // A book named by its id is wanted; the publisher filter is for --all.
        includeSkippedPublishers: !all,
        knownTitles: await knownTitles(),
        onProgress: (message) => process.stdout.write(`  ${message}\n`),
      });
      const { book } = result;
      if (result.status === "skipped") {
        console.log(`  skipped: already imported as ${book.id} (${book.status}, ${bookLanguage(book)}). Use --force to replace it.`);
        continue;
      }
      created += 1;
      const images = book.pages.filter((page) => page.image).length;
      console.log(`  ${result.status}: ${book.id} "${book.title}" (${book.pages.length} pages, ${images} illustrations, ${book.status}, ${bookLanguage(book)})`);
      console.log(`  license: ${book.license}   publisher: ${book.credits?.publisher ?? "(none)"}   source: ${book.source}`);
      console.log(`  author: ${book.author || "(none)"}   illustrator: ${book.illustrator || "(none)"}   translator: ${book.credits?.translator ?? "(none)"}`);
      for (const warning of result.warnings) console.log(`  warning: ${warning}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof LetsReadError && REFUSALS.includes(err.code)) {
        refused += 1;
        console.log(`  refused: ${message}`);
      } else {
        failed += 1;
        console.error(`  failed: ${message}`);
        if (err instanceof LetsReadError && err.code === "rate-limited") break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  console.log(`\n${created} imported, ${refused} refused, ${failed} failed, ${tried} tried`);
  // With --all a refusal is the filter at work; a book asked for by its id that was refused is an error.
  if (failed > 0 || (!all && refused > 0)) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
