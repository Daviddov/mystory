/**
 * Imports free picture books from StoryWeaver (Creative Commons, mostly CC BY 4.0) as drafts.
 *
 *   npm run import:storyweaver -- --list                 show the catalogue and what is already imported
 *   npm run import:storyweaver -- <slug> [<slug> ...]    import these stories
 *   npm run import:storyweaver -- --all                  import every story of the catalogue
 *     --language <name> the StoryWeaver language of --list and --all: Hebrew (default) or English
 *     --limit <n>       at most n stories of the catalogue (English has many thousands)
 *     --owner <email>   the user who will own the drafts (created when missing).
 *                       Default: the library owner ("system"), whose books
 *                       every editor and admin can open in the studio.
 *     --force           import again and REPLACE the existing copy, including
 *                       its narration and edits
 *
 * A story that was imported before is skipped (found by its StoryWeaver id).
 * Hebrew stories arrive in Hebrew; English ones stay in English until someone
 * translates them in the studio. A story whose license forbids adaptations is refused.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data). tsx does not read .env.local, so
 * export the variables in the shell first.
 */
import path from "node:path";
import { StoryWeaverClient, StoryWeaverError, STORYWEAVER, findStoryWeaverBook, importStoryWeaverBook } from "../src/lib/importers/storyweaver";
import { LocalMediaStore } from "../src/lib/media/local";
import type { MediaStore } from "../src/lib/media/types";
import { LocalRepository } from "../src/lib/repo/local";
import type { Repository } from "../src/lib/repo/types";
import { bookLanguage, SYSTEM_OWNER_ID } from "../src/lib/types";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

const USAGE =
  "usage: tsx scripts/import-storyweaver.ts <slug> [...] | --all | --list  [--language Hebrew|English] [--limit <n>] [--owner <email>] [--force]";

/** Pause between stories, so a full import is gentle on StoryWeaver's servers. */
const PAUSE_MS = 500;

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
  let language = "Hebrew";
  let limit = Infinity;
  const slugs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--owner") {
      ownerEmail = args[++i];
      if (!ownerEmail) throw new Error("--owner needs an email address");
    } else if (arg === "--language") {
      language = args[++i] ?? "";
      if (!(language in STORYWEAVER.languages)) throw new Error(`--language must be one of ${Object.keys(STORYWEAVER.languages).join(", ")}`);
    } else if (arg === "--limit") {
      limit = Number(args[++i]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit needs a positive number");
    } else if (arg.startsWith("--")) {
      if (!["--force", "--all", "--list"].includes(arg)) throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else slugs.push(arg.toLowerCase());
  }
  if (!all && !list && slugs.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const { repo, media, label } = await openStorage();
  const client = new StoryWeaverClient();
  console.log(`storage: ${label}`);

  if (list) {
    const entries = await client.catalogue(language, limit);
    for (const entry of entries) {
      const local = await findStoryWeaverBook(repo, entry.slug);
      const state = !local ? "-" : `imported (${local.status}, ${bookLanguage(local)})`;
      console.log(`${entry.slug.padEnd(60)} ${state.padEnd(24)} ${entry.title}`);
    }
    console.log(`\n${entries.length} stories in ${language}`);
    return;
  }

  const owner = await resolveOwner(repo, ownerEmail);
  console.log(`owner:   ${owner.label}`);
  const targets = all ? (await client.catalogue(language, limit)).map((entry) => entry.slug) : slugs;

  let failed = 0;
  let created = 0;
  for (const slug of targets) {
    console.log(`\n${slug}`);
    try {
      const result = await importStoryWeaverBook({
        slug,
        ownerId: owner.id,
        repo,
        media,
        client,
        force,
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
      console.log(`  license: ${book.license}   source: ${book.source}`);
      console.log(`  author: ${book.author || "(none)"}   illustrator: ${book.illustrator || "(none)"}   translator: ${book.credits?.translator ?? "(none)"}`);
      for (const warning of result.warnings) console.log(`  warning: ${warning}`);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    } catch (err) {
      failed += 1;
      console.error(`  failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof StoryWeaverError && err.code === "rate-limited") break;
    }
  }
  console.log(`\n${created} imported, ${failed} failed, ${targets.length} requested`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
