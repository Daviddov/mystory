/**
 * Sets the metadata and credits of a book from a JSON file and optionally
 * submits it for approval, for books prepared outside the site (imports).
 *
 *   tsx scripts/book-meta.ts <bookId> <file> [--submit]
 *
 * The file holds a studio metadata patch (see BookMetaPatchSchema): title,
 * summary, author, illustrator, ageGroup, categories, tags, themes,
 * discussionQuestions, credits. Credits in the file are merged over the stored
 * ones. Everything goes through the studio service, so the same validation and
 * the same publish checks apply as in the site. --submit sets the status to
 * 'pending'; it never publishes.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LocalMediaStore } from "../src/lib/media/local";
import { LocalRepository } from "../src/lib/repo/local";
import { setBookStatus, StudioError, updateBookMeta } from "../src/lib/studio/service";
import { BookMetaPatchSchema } from "../src/lib/studio/shared";
import type { User } from "../src/lib/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const submit = args.includes("--submit");
  const [bookId, file] = args.filter((arg) => !arg.startsWith("--"));
  if (!bookId || !file) {
    console.error("usage: tsx scripts/book-meta.ts <bookId> <file> [--submit]");
    process.exit(2);
  }
  const root = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);
  const book = await repo.getBookById(bookId);
  if (!book) throw new Error(`no book with the id ${bookId}`);

  const raw = JSON.parse((await readFile(path.resolve(file), "utf8")).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  const { publisherLogo: _logo, ...stored } = book.credits ?? {};
  void _logo;
  if (raw.credits && typeof raw.credits === "object") raw.credits = { ...stored, ...(raw.credits as object) };
  const patch = BookMetaPatchSchema.parse(raw);

  // Acts as an editor of the library, like an editor working in the studio.
  const user: User = { id: "system", name: "import", role: "editor" } as User;
  const ctx = { repo, media, user };
  await updateBookMeta(ctx, bookId, patch);
  if (submit) await setBookStatus(ctx, bookId, "pending");
  const after = await repo.getBookById(bookId);
  console.log(`${bookId}: "${after?.title}" author=${after?.author || "-"} illustrator=${after?.illustrator || "-"} status=${after?.status}`);
}

main().catch((err) => {
  if (err instanceof StudioError) console.error(err.message, JSON.stringify((err as { details?: unknown }).details ?? "", null, 1));
  else console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
