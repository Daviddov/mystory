/**
 * Sets the metadata and credits of a book from a JSON file and optionally
 * submits it for approval, for books prepared outside the site (imports).
 *
 *   tsx scripts/book-meta.ts <bookId> <file> [--submit]
 *   tsx scripts/book-meta.ts --batch <file> [--submit]
 *
 * The file holds a studio metadata patch (see BookMetaPatchSchema): title,
 * summary, author, illustrator, ageGroup, categories, tags, themes,
 * discussionQuestions, credits. With --batch the file holds many patches, as
 * an object keyed by book id: { "<bookId>": { ...patch }, ... }; a book that is
 * refused is reported and the others are still handled.
 *
 * Credits in the file are merged over the stored ones. The same validation
 * and the same publication checklist apply as in the studio (see
 * scripts/lib/local-books.ts). --submit sets the status to 'pending'; it never
 * publishes. Only the local data directory is supported.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyMetaPatch, openLocalRepository } from "./lib/local-books";

async function readJsonFile(file: string): Promise<Record<string, unknown>> {
  return JSON.parse((await readFile(path.resolve(file), "utf8")).replace(/^﻿/, "")) as Record<string, unknown>;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const submit = args.includes("--submit");
  const batch = args.includes("--batch");
  const [first, second] = args.filter((arg) => !arg.startsWith("--"));
  if (batch ? !first : !first || !second) {
    console.error(
      "usage: tsx scripts/book-meta.ts <bookId> <file> [--submit]\n       tsx scripts/book-meta.ts --batch <file> [--submit]",
    );
    process.exit(2);
  }
  const repo = openLocalRepository();
  const patches: [string, Record<string, unknown>][] = batch
    ? (Object.entries(await readJsonFile(first)) as [string, Record<string, unknown>][])
    : [[first, await readJsonFile(second)]];

  let failed = 0;
  for (const [bookId, raw] of patches) {
    try {
      const after = await applyMetaPatch(repo, bookId, raw, { submit });
      console.log(
        `${bookId}: "${after.title}" author=${after.author || "-"} categories=${after.categories.join(",") || "-"} status=${after.status}`,
      );
    } catch (err) {
      failed += 1;
      console.error(`${bookId}: FAILED ${describe(err)}`);
    }
  }
  if (failed > 0) {
    if (batch) console.error(`\n${failed} book(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(describe(err));
  process.exit(1);
});
