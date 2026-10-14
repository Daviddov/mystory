/**
 * Metadata edits on the local data directory, for the command-line scripts.
 * The studio service cannot be loaded outside the Next.js server (it pulls in
 * the session code), so this applies the same rules on the repository: the
 * studio's patch schema, its handling of credits, and its publication
 * checklist before a book is submitted.
 */
import path from "node:path";
import { LocalRepository } from "../../src/lib/repo/local";
import type { BookPatch } from "../../src/lib/repo/types";
import { BookMetaPatchSchema, publishProblems } from "../../src/lib/studio/shared";
import type { BookWithPages } from "../../src/lib/types";

export function openLocalRepository(): LocalRepository {
  const root = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  return new LocalRepository(root);
}

export interface MetaPatchOptions {
  /** Set the status to 'pending' afterwards. Refused when the publication checklist has open items. */
  submit?: boolean;
}

/**
 * Validates and stores a studio metadata patch. Credits in the patch are
 * merged over the stored ones; empty credit fields are dropped and the stored
 * publisher logo is kept.
 */
export async function applyMetaPatch(
  repo: LocalRepository,
  bookId: string,
  raw: Record<string, unknown>,
  options: MetaPatchOptions = {},
): Promise<BookWithPages> {
  const book = await repo.getBookById(bookId);
  if (!book) throw new Error(`no book with the id ${bookId}`);

  const patch = BookMetaPatchSchema.parse(raw);
  const clean: BookPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (clean as Record<string, unknown>)[key] = value;
  }
  if (patch.credits !== undefined) {
    const credits: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...book.credits, ...patch.credits })) {
      if (key !== "publisherLogo" && typeof value === "string" && value.length > 0) credits[key] = value;
    }
    if (book.credits?.publisherLogo) credits.publisherLogo = book.credits.publisherLogo;
    clean.credits = Object.keys(credits).length > 0 ? credits : undefined;
  }
  if (clean.coverImage !== undefined) throw new Error("the cover cannot be changed from here");
  if (Object.keys(clean).length > 0) await repo.updateBook(bookId, clean);

  if (options.submit) {
    const current = await repo.getBookById(bookId);
    const problems = current ? publishProblems(current) : [];
    if (problems.length > 0) {
      throw new Error(`not ready to submit: ${problems.map((problem) => problem.message).join("; ")}`);
    }
    await repo.updateBook(bookId, { status: "pending", reviewNote: undefined });
  }
  return (await repo.getBookById(bookId)) as BookWithPages;
}
