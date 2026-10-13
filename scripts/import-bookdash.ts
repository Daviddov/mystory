/**
 * Imports free picture books from Book Dash (CC BY 4.0) as English drafts.
 *
 *   npm run import:bookdash -- --list                 show the catalogue and what is already imported
 *   npm run import:bookdash -- <slug> [<slug> ...]    import these books
 *   npm run import:bookdash -- --all                  import every book of the catalogue
 *     --owner <email>   the user who will own the drafts (created when missing).
 *                       Default: the library owner ("system"), whose books
 *                       every editor and admin can open in the studio.
 *     --force           import again and REPLACE the existing copy, including
 *                       its translation, narration and edits
 *
 * A book that was imported before is skipped (found by its Book Dash slug).
 * The drafts stay in English until someone translates them in the studio.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data). tsx does not read .env.local, so
 * export the variables in the shell first. GITHUB_TOKEN is optional and only
 * raises GitHub's limit for the folder listing.
 */
import path from "node:path";
import { missingCreditRoles } from "../src/lib/credits";
import { BookDashClient, BookDashError, findBookDashBook, importBookDashBook } from "../src/lib/importers/bookdash";
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
  "usage: tsx scripts/import-bookdash.ts <slug> [...] | --all | --list  [--owner <email>] [--force] [--web]";

async function openStorage(): Promise<{
  repo: Repository;
  media: MediaStore;
  label: string;
}> {
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
  return {
    repo: new LocalRepository(root),
    media: new LocalMediaStore(root),
    label: root,
  };
}

async function resolveOwner(repo: Repository, email: string | undefined): Promise<{ id: string; label: string }> {
  if (!email)
    return {
      id: SYSTEM_OWNER_ID,
      label: `${SYSTEM_OWNER_ID} (the library owner)`,
    };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`--owner needs an email address, got "${email}"`);
  const existing = await repo.getUserByEmail(email);
  if (existing)
    return {
      id: existing.id,
      label: `${existing.name} <${email}> (${existing.role})`,
    };
  if (repo.kind === "supabase") {
    throw new Error(`no user with the email ${email}. With Supabase the user must sign in to the site once first.`);
  }
  const created = await repo.upsertUser({ name: email.split("@")[0], email });
  return {
    id: created.id,
    label: `${created.name} <${email}> (new local user, role ${created.role})`,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const web = args.includes("--web");
  const all = args.includes("--all");
  const list = args.includes("--list");
  let ownerEmail: string | undefined;
  const slugs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--owner") {
      ownerEmail = args[++i];
      if (!ownerEmail) throw new Error("--owner needs an email address");
    } else if (arg.startsWith("--")) {
      if (!["--force", "--web", "--all", "--list"].includes(arg)) throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else slugs.push(arg.toLowerCase());
  }
  if (!all && !list && slugs.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const { repo, media, label } = await openStorage();
  const client = new BookDashClient({ githubToken: env("GITHUB_TOKEN") });
  console.log(`storage: ${label}`);

  if (list) {
    const catalogue = await client.catalogue();
    if (!catalogue.complete) console.log("note: the folder listing failed; showing only the books named in meta.yml");
    for (const entry of catalogue.entries) {
      const local = await findBookDashBook(repo, entry.slug);
      const state = !local
        ? "-"
        : bookLanguage(local) === "he"
          ? `translated (${local.status})`
          : `imported (${local.status})`;
      console.log(`${entry.slug.padEnd(38)} ${state.padEnd(22)} ${entry.title}`);
    }
    console.log(`\n${catalogue.entries.length} books`);
    return;
  }

  const owner = await resolveOwner(repo, ownerEmail);
  console.log(`owner:   ${owner.label}`);
  const targets = all ? (await client.catalogue()).entries.map((entry) => entry.slug) : slugs;

  let failed = 0;
  for (const slug of targets) {
    console.log(`\n${slug}`);
    try {
      const result = await importBookDashBook({
        slug,
        ownerId: owner.id,
        repo,
        media,
        client,
        force,
        web,
        onProgress: (message) => process.stdout.write(`  ${message}\n`),
      });
      const { book } = result;
      if (result.status === "skipped") {
        console.log(
          `  skipped: already imported as ${book.id} (${book.status}, ${bookLanguage(book)}). Use --force to replace it.`,
        );
        continue;
      }
      const images = book.pages.filter((page) => page.image).length;
      console.log(
        `  ${result.status}: ${book.id} "${book.title}" (${book.pages.length} pages, ${images} illustrations, ${book.status}, ${bookLanguage(book)})`,
      );
      console.log(`  license: ${book.license}   source: ${book.source}`);
      console.log(`  creators: ${book.credits?.creators ?? "(none found)"}`);
      console.log(`  logo: ${book.credits?.publisherLogo ?? "(missing)"}   cover: ${book.coverImage || "(none)"}`);
      const missing = missingCreditRoles(book);
      if (missing.length > 0)
        console.log(`  NEEDS CREDIT REVIEW: no ${missing.join(", ")} named (the source lists creators without roles)`);
      for (const warning of result.warnings) console.log(`  warning: ${warning}`);
    } catch (err) {
      failed += 1;
      console.error(`  failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof BookDashError && err.code === "rate-limited") break;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} book(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
