// One-off: replace one page (or "cover")'s picture of a local book with a new PNG (stored as WebP under a hashed name).
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { storeImage } from "../src/lib/media/optimize";
import { bookMediaPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";

const [id, pageNo, png] = process.argv.slice(2);
(async () => {
  const repo = new LocalRepository(dataDir());
  const book = await repo.getBookById(id);
  if (!book) throw new Error("no book " + id);
  const bytes = new Uint8Array(await readFile(png));
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 10);
  const name = pageNo === "cover" ? `cover-${hash}.png` : `page-${pageNo.padStart(2, "0")}-${hash}.png`;
  const stored = await storeImage(new LocalMediaStore(dataDir()), bookMediaPath(id, name), bytes, "image/png");
  if (pageNo === "cover") {
    console.log(book.coverImage, "->", stored.path);
    await repo.updateBook(id, { coverImage: stored.path });
    return;
  }
  const i = Number(pageNo) - 1;
  console.log(book.pages[i].image, "->", stored.path);
  const pages = book.pages.map((p, k) => (k === i ? { ...p, image: stored.path } : p));
  await repo.replacePages(id, pages);
})();
