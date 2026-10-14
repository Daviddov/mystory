/**
 * Fills in who made the imported Book Dash books. The GitHub repository names
 * a book's makers as one list without roles, so the importer leaves author,
 * illustrator, designer and editor empty; the book's page on bookdash.org
 * names each role. This reads that page for every Book Dash book without an
 * author and stores the roles it finds. A filled-in field is never replaced.
 *
 *   tsx scripts/bookdash-credits.ts [<slug> ...] [--dry-run]
 *
 * Only the local data directory (DATA_DIR or ./data) is supported.
 */
import { fetchBookDashWebPage } from "../src/lib/importers/bookdash-web";
import { applyMetaPatch, openLocalRepository } from "./lib/local-books";

const ID_PREFIX = "bookdash-";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const slugs = args.filter((arg) => !arg.startsWith("--"));
  const repo = openLocalRepository();

  const { books } = await repo.listBooks({ status: "any", sort: "title" });
  const targets = books.filter(
    (book) =>
      book.id.startsWith(ID_PREFIX) &&
      (slugs.length > 0 ? slugs.includes(book.id.slice(ID_PREFIX.length)) : !book.author.trim()),
  );
  let filled = 0;
  let failed = 0;
  for (const book of targets) {
    const slug = book.id.slice(ID_PREFIX.length);
    try {
      const { credits } = await fetchBookDashWebPage(slug, 0);
      const patch: Record<string, unknown> = {};
      if (!book.author.trim() && credits.author) patch.author = credits.author;
      if (!book.illustrator.trim() && credits.illustrator) patch.illustrator = credits.illustrator;
      const roles: Record<string, string> = {};
      if (!book.credits?.designer && credits.designer) roles.designer = credits.designer;
      if (!book.credits?.editor && credits.editor) roles.editor = credits.editor;
      if (Object.keys(roles).length > 0) patch.credits = roles;

      if (!patch.author && !book.author.trim()) {
        failed += 1;
        console.error(`${slug}: no writer named on the page (listed makers: ${book.credits?.creators ?? "-"})`);
      } else if (patch.author) filled += 1;
      if (Object.keys(patch).length === 0) continue;
      if (!dryRun) await applyMetaPatch(repo, book.id, patch);
      console.log(
        `${slug}: author=${patch.author ?? "-"} illustrator=${patch.illustrator ?? "-"} designer=${roles.designer ?? "-"} editor=${roles.editor ?? "-"}`,
      );
    } catch (err) {
      failed += 1;
      console.error(`${slug}: FAILED ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\n${filled} of ${targets.length} book(s) got an author${dryRun ? " (dry run, nothing stored)" : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
