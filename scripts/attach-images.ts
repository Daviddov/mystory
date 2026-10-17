/**
 * Attaches generated pictures to a book that already exists in the local library.
 *
 *   npx tsx scripts/attach-images.ts <book-id-or-slug> <img-folder> [--publish]
 *
 * <img-folder> holds cover.png and page-NN.png (Gemini output). The pictures are
 * converted to 1200 px JPEGs in data/media/books/<id>/ (cover.jpg, page-NN.jpg), then
 * the book's coverImage and every page's image are set. Page text and any nikud or
 * narration data are left as they are. Refuses when a page picture is missing.
 * --publish also sets the status to "published".
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { LocalRepository } from "../src/lib/repo/local";

async function main(): Promise<void> {
  const [ref, imgDir] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const publish = process.argv.includes("--publish");
  if (!ref || !imgDir) throw new Error("usage: attach-images.ts <book-id-or-slug> <img-folder> [--publish]");

  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const book = (await repo.getBookById(ref)) ?? (await repo.getBookBySlug(ref));
  if (!book) throw new Error(`no book with id or slug ${ref}`);

  const pageFile = (i: number) => `page-${String(i + 1).padStart(2, "0")}`;
  const missing = ["cover", ...book.pages.map((_, i) => pageFile(i))].filter(
    (name) => !existsSync(path.join(imgDir, `${name}.png`)),
  );
  if (missing.length > 0) throw new Error(`missing in ${imgDir}: ${missing.map((m) => `${m}.png`).join(", ")}`);

  const dst = path.join(root, "media", "books", book.id);
  const convert = path.join(process.cwd(), ".claude", "skills", "ai-picture-book", "scripts", "convert-images.py");
  const run = spawnSync("python", ["-P", convert, imgDir, dst], { stdio: "inherit" });
  if (run.status !== 0) throw new Error("convert-images.py failed");

  await repo.replacePages(
    book.id,
    book.pages.map((page, i) => ({ ...page, image: `books/${book.id}/${pageFile(i)}.jpg` })),
  );
  await repo.updateBook(book.id, {
    coverImage: `books/${book.id}/cover.jpg`,
    ...(publish ? { status: "published" as const } : {}),
  });
  console.log(`attached ${book.pages.length} pages + cover to ${book.id} (${book.slug})${publish ? ", published" : ""}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
