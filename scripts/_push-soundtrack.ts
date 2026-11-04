// One-off: push a book's narration (pages) and soundtrack to Supabase, uploading the new media.
//   npx tsx --env-file=.env.supabase scripts/_push-soundtrack.ts <book id>
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

(async () => {
  const id = process.argv[2];
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();
  const book = await local.getBookById(id);
  const before = await remote.getBookById(id);
  if (!book || !before) throw new Error("missing " + id);
  const textDiffs = book.pages.filter((p, i) => before.pages[i]?.text !== p.text).length;
  if (before.pages.length !== book.pages.length || textDiffs) throw new Error(`page text differs (${textDiffs}); not pushing`);
  const remoteFiles = new Set(await remoteMedia.list("books/" + id));
  const media = [...book.pages.flatMap((p) => [p.image, p.audio]), book.soundtrack];
  for (const m of media) {
    if (!m || remoteFiles.has(m)) continue;
    const obj = await localMedia.get(m);
    if (!obj) throw new Error("no local file " + m);
    await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
    console.log("  uploaded", m);
  }
  await remote.replacePages(id, book.pages);
  await remote.updateBook(id, { soundtrack: book.soundtrack });
  const after = await remote.getBookById(id);
  console.log(id, "status", after?.status, "audio pages", after?.pages.filter((p) => p.audio).length, "soundtrack", after?.soundtrack);
})();
