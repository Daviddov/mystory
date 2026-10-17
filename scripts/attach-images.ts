/**
 * Attaches generated pictures to a book that already exists in the local library.
 *
 *   npx tsx scripts/attach-images.ts <book-id-or-slug> <img-folder> [--publish]
 *
 * <img-folder> holds cover.png and page-NN.png (Gemini output). The pictures are
 * stored as WebP (at most 1600 px, see src/lib/media/optimize.ts) in
 * data/media/books/<id>/, the PNGs kept in data/originals/media/books/<id>/, then
 * the book's coverImage and every page's image are set. Page text and any nikud or
 * narration data are left as they are. Refuses when a page picture is missing.
 * --publish also sets the status to "published".
 */
import path from "node:path";
import { LocalRepository } from "../src/lib/repo/local";
import { bookImageNames, pageImageName, storeBookImages } from "./lib/book-images";

async function main(): Promise<void> {
  const [ref, imgDir] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const publish = process.argv.includes("--publish");
  if (!ref || !imgDir) throw new Error("usage: attach-images.ts <book-id-or-slug> <img-folder> [--publish]");

  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const book = (await repo.getBookById(ref)) ?? (await repo.getBookBySlug(ref));
  if (!book) throw new Error(`no book with id or slug ${ref}`);

  const images = await storeBookImages(root, book.id, imgDir, bookImageNames(book.pages.length));
  await repo.replacePages(
    book.id,
    book.pages.map((page, i) => ({ ...page, image: images.get(pageImageName(i)) })),
  );
  await repo.updateBook(book.id, {
    coverImage: images.get("cover"),
    ...(publish ? { status: "published" as const } : {}),
  });
  console.log(`attached ${book.pages.length} pages + cover to ${book.id} (${book.slug})${publish ? ", published" : ""}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
