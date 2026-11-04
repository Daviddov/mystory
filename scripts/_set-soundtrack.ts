// Stores an audio file as a book's background music (Book.soundtrack), local data only.
//   npx tsx scripts/_set-soundtrack.ts <slug> <file.mp3>
import fs from "node:fs";
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { bookMediaPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";

(async () => {
  const [slug, file] = process.argv.slice(2);
  if (!slug || !file) throw new Error("usage: _set-soundtrack.ts <slug> <file.mp3>");
  const repo = new LocalRepository(dataDir());
  const book = await repo.getBookBySlug(slug);
  if (!book) throw new Error("no book " + slug);
  const media = new LocalMediaStore(dataDir());
  const stored = await media.put(bookMediaPath(book.id, "soundtrack.mp3"), fs.readFileSync(file), "audio/mpeg");
  await repo.updateBook(book.id, { soundtrack: stored.path });
  console.log(`${book.title}: soundtrack ${stored.path}`);
})();
