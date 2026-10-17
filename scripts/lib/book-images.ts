/**
 * Stores a folder of generated pictures (cover.png, page-NN.png from Gemini)
 * as a book's illustrations in the local library, through the same helper as
 * the site (src/lib/media/optimize.ts): WebP in data/media/books/<id>/, the PNG
 * kept in data/originals/media/books/<id>/.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { LocalMediaStore } from "../../src/lib/media/local";
import { storeImage } from "../../src/lib/media/optimize";
import { bookMediaPath } from "../../src/lib/media/url";

/** "page-01" for page index 0. */
export const pageImageName = (index: number): string => `page-${String(index + 1).padStart(2, "0")}`;

/** The names the folder must hold for a book of `pageCount` pages: cover, page-01... */
export const bookImageNames = (pageCount: number): string[] => [
  "cover",
  ...Array.from({ length: pageCount }, (_, i) => pageImageName(i)),
];

/** Throws, naming every file, when a <name>.png is missing in `imgDir`. */
export function assertBookImages(imgDir: string, names: string[]): void {
  const missing = names.filter((name) => !existsSync(path.join(imgDir, `${name}.png`)));
  if (missing.length > 0) throw new Error(`missing in ${imgDir}: ${missing.map((m) => `${m}.png`).join(", ")}`);
}

/** Stores <imgDir>/<name>.png for every name; returns name -> media path to save in the book. */
export async function storeBookImages(dataRoot: string, bookId: string, imgDir: string, names: string[]): Promise<Map<string, string>> {
  assertBookImages(imgDir, names);
  const media = new LocalMediaStore(dataRoot);
  const paths = new Map<string, string>();
  for (const name of names) {
    const bytes = new Uint8Array(await readFile(path.join(imgDir, `${name}.png`)));
    const stored = await storeImage(media, bookMediaPath(bookId, `${name}.png`), bytes, "image/png");
    paths.set(name, stored.path);
  }
  return paths;
}
