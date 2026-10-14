/**
 * Imports illustrated public-domain picture books from Project Gutenberg as English drafts.
 *
 *   npm run import:gutenberg -- --list                 show the curated list and what is already imported
 *   npm run import:gutenberg -- <number> [<number> ...] import these ebooks (the number in gutenberg.org/ebooks/<number>)
 *   npm run import:gutenberg -- --all                  import every book of the curated list
 *     --owner <email>   the user who will own the drafts (created when missing).
 *                       Default: the library owner ("system"), whose books
 *                       every editor and admin can open in the studio.
 *     --force           import again and REPLACE the existing copy, including
 *                       its translation, narration and edits
 *
 * A book that was imported before is skipped (found by its ebook number). The drafts
 * stay in English until someone translates them in the studio.
 *
 * Project Gutenberg forbids crawling. This script never lists or searches the site:
 * the curated list (GUTENBERG_BOOKS) is written by hand, and --list reads only that
 * and the local storage. For each ebook it fetches the rdf, the HTML and its pictures,
 * one request after the other, and waits two seconds before the next book. When the
 * server answers 403 or 429, or with a "blocked" page, the run STOPS: do not retry
 * right away and do not work around it.
 *
 * Refused, and counted apart from failures:
 *   - a book that is not "Public domain in the USA.", or one of whose creators died
 *     after 1955 or in an unknown year: this site is Israeli, where copyright lasts
 *     70 years after the creator's death.
 *   - a book that is not a picture book of text next to pictures: fewer than six
 *     illustrated pages, more than 60 pages, or mostly pages without a picture.
 *
 * An ebook number that is not on the curated list is imported with a warning: nobody
 * checked that its pictures hold no text and that each picture sits with its text.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data). tsx does not read .env.local, so
 * export the variables in the shell first.
 */
import path from "node:path";
import {
  GUTENBERG_BOOKS,
  GutenbergClient,
  GutenbergError,
  findGutenbergBook,
  gutenbergCuratedBook,
  gutenbergStoryId,
  importGutenbergBook,
  importGutenbergCollection,
  type GutenbergErrorCode,
} from "../src/lib/importers/gutenberg";
import { LocalMediaStore } from "../src/lib/media/local";
import type { MediaStore } from "../src/lib/media/types";
import { LocalRepository } from "../src/lib/repo/local";
import type { Repository } from "../src/lib/repo/types";
import { bookLanguage, SYSTEM_OWNER_ID } from "../src/lib/types";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

const USAGE = "usage: tsx scripts/import-gutenberg.ts <ebook number> [...] | --all | --list  [--owner <email>] [--force]";

/** Pause between books: Project Gutenberg asks automated readers to be slow. */
const PAUSE_MS = 2000;

/** A book the importer will not take, as opposed to one it could not download. */
const REFUSALS: readonly GutenbergErrorCode[] = ["license", "no-text", "invalid-book"];

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
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--owner") {
      ownerEmail = args[++i];
      if (!ownerEmail) throw new Error("--owner needs an email address");
    } else if (arg.startsWith("--")) {
      if (!["--force", "--all", "--list"].includes(arg)) throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else ids.push(arg.replace(/^gutenberg-/i, ""));
  }
  if (!all && !list && ids.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const { repo, media, label } = await openStorage();
  console.log(`storage: ${label}`);

  if (list) {
    // The curated list and the local storage only: nothing is asked of Project Gutenberg.
    for (const entry of GUTENBERG_BOOKS) {
      let state: string;
      if (entry.collection) {
        // A collection is stored as one book per story; the first ones tell whether it was imported.
        let found = 0;
        for (let n = 1; n <= 200; n++) if (await repo.getBookById(gutenbergStoryId(entry.id, n))) found += 1;
        state = found > 0 ? `imported (${found} stories)` : "- (collection)";
      } else {
        const local = await findGutenbergBook(repo, entry.id);
        state = local ? `imported (${local.status}, ${bookLanguage(local)})` : "-";
      }
      console.log(`${entry.id.padEnd(7)} ${state.padEnd(24)} ${entry.title}`);
    }
    console.log(`\n${GUTENBERG_BOOKS.length} books on the curated list.`);
    return;
  }

  const owner = await resolveOwner(repo, ownerEmail);
  console.log(`owner:   ${owner.label}`);
  const targets = all ? GUTENBERG_BOOKS.map((entry) => entry.id) : ids;
  const client = new GutenbergClient();

  let failed = 0;
  let refused = 0;
  let created = 0;
  let tried = 0;
  let asked = false;
  for (const id of targets) {
    // The pause is only owed when the book before this one was really asked of the server.
    if (asked) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    asked = false;
    tried += 1;
    console.log(`\n${id}${gutenbergCuratedBook(id) ? "" : "  (not on the curated list)"}`);
    try {
      if (gutenbergCuratedBook(id)?.collection) {
        const result = await importGutenbergCollection({
          id,
          ownerId: owner.id,
          repo,
          media,
          client,
          force,
          onProgress: (message) => {
            asked = true;
            process.stdout.write(`  ${message}
`);
          },
        });
        for (const story of result.stories) {
          if (story.status === "skipped") {
            console.log(`  skipped: ${story.book.id} "${story.book.title}" (${story.book.status}). Use --force to replace it.`);
            continue;
          }
          created += 1;
          console.log(`  ${story.status}: ${story.book.id} "${story.book.title}" (${story.book.pages.length} pages, ${story.book.status}, ${bookLanguage(story.book)})`);
        }
        for (const warning of result.warnings) console.log(`  warning: ${warning}`);
        continue;
      }
      const result = await importGutenbergBook({
        id,
        ownerId: owner.id,
        repo,
        media,
        client,
        force,
        onProgress: (message) => {
          asked = true;
          process.stdout.write(`  ${message}\n`);
        },
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
      console.log(`  author: ${book.author || "(none)"}   illustrator: ${book.illustrator || "(none)"}   age: ${book.ageGroup}`);
      for (const warning of result.warnings) console.log(`  warning: ${warning}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof GutenbergError && REFUSALS.includes(err.code)) {
        refused += 1;
        console.log(`  refused: ${message}`);
      } else {
        failed += 1;
        console.error(`  failed: ${message}`);
        if (err instanceof GutenbergError && err.code === "blocked") {
          console.error("\nProject Gutenberg refused the request. Stopping: do not retry right away and do not work around it.");
          break;
        }
      }
    }
  }
  console.log(`\n${created} imported, ${refused} refused, ${failed} failed, ${tried} tried`);
  if (failed > 0 || refused > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
