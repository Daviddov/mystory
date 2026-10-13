/**
 * Imports free picture books of African Storybook (only the CC BY ones) as English drafts.
 * Texts come from github.com/global-asp/asp-source, pictures from github.com/global-asp/asp-imagebank.
 *
 *   npm run import:african-storybook -- --list              show the catalogue, the licenses and what is already imported
 *   npm run import:african-storybook -- <id> [<id> ...]     import these stories (a story number: 10, 0010 or asp-0010)
 *   npm run import:african-storybook -- --all               import every story whose license allows it
 *     --limit <n>       at most n stories of the catalogue
 *     --owner <email>   the user who will own the drafts (created when missing).
 *                       Default: the library owner ("system"), whose books
 *                       every editor and admin can open in the studio.
 *     --force           import again and REPLACE the existing copy, including
 *                       its translation, narration and edits
 *
 * A story that was imported before is skipped (found by its story number).
 * The drafts stay in English until someone translates them in the studio.
 * A story is refused when it is CC BY-NC, when its CC BY version is one the
 * site cannot record (3.0), or when its pictures cannot be matched to its pages.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data). tsx does not read .env.local, so
 * export the variables in the shell first. GITHUB_TOKEN is optional and only
 * raises GitHub's limit for the folder listing, which few stories need.
 */
import path from "node:path";
import {
  AfricanStorybookClient,
  AfricanStorybookError,
  africanStorybookNumber,
  findAfricanStorybookBook,
  importAfricanStorybookBook,
} from "../src/lib/importers/african-storybook";
import { LocalMediaStore } from "../src/lib/media/local";
import type { MediaStore } from "../src/lib/media/types";
import { LocalRepository } from "../src/lib/repo/local";
import type { Repository } from "../src/lib/repo/types";
import { bookLanguage, SYSTEM_OWNER_ID } from "../src/lib/types";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

const USAGE = "usage: tsx scripts/import-african-storybook.ts <id> [...] | --all | --list  [--limit <n>] [--owner <email>] [--force]";

/** Pause between stories, so a full import is gentle on GitHub. */
const PAUSE_MS = 200;

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
    } else {
      if (!africanStorybookNumber(arg)) throw new Error(`"${arg}" is not a story number\n${USAGE}`);
      ids.push(arg);
    }
  }
  if (!all && !list && ids.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const { repo, media, label } = await openStorage();
  const client = new AfricanStorybookClient({ githubToken: env("GITHUB_TOKEN") });
  console.log(`storage: ${label}`);

  if (list) {
    const catalogue = (await client.catalogue()).slice(0, limit);
    for (const entry of catalogue) {
      const local = await findAfricanStorybookBook(repo, entry.number);
      const state = !local ? "-" : bookLanguage(local) === "he" ? `translated (${local.status})` : `imported (${local.status})`;
      const license = `${entry.license || "unknown"}${entry.importable ? "" : " (refused)"}`;
      console.log(`${entry.number}  ${license.padEnd(24)} ${state.padEnd(22)} ${entry.title}`);
    }
    console.log(`\n${catalogue.length} stories, ${catalogue.filter((entry) => entry.importable).length} with a license that can be imported`);
    return;
  }

  const owner = await resolveOwner(repo, ownerEmail);
  console.log(`owner:   ${owner.label}`);
  const targets = all
    ? (await client.catalogue())
        .filter((entry) => entry.importable)
        .slice(0, limit)
        .map((entry) => entry.number)
    : ids.slice(0, limit);

  let failed = 0;
  let created = 0;
  for (const id of targets) {
    console.log(`\n${id}`);
    try {
      const result = await importAfricanStorybookBook({
        id,
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
      if (err instanceof AfricanStorybookError && err.code === "rate-limited") break;
    }
  }
  console.log(`\n${created} imported, ${failed} failed, ${targets.length} requested`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
