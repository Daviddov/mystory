// One-off: push the 2026-11-01 text/audio/image fixes of four books to Supabase (pages + summary + new media only).
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

const ids = process.argv.slice(2);
(async () => {
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();
  for (const id of ids) {
    const book = await local.getBookById(id);
    const before = await remote.getBookById(id);
    if (!book || !before) throw new Error("missing " + id);
    const remoteFiles = new Set(await remoteMedia.list("books/" + id));
    for (const p of book.pages) {
      for (const m of [p.image, p.audio]) {
        if (!m || remoteFiles.has(m)) continue;
        const obj = await localMedia.get(m);
        if (!obj) throw new Error("no local file " + m);
        await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
        console.log("  uploaded", m);
      }
    }
    await remote.replacePages(id, book.pages);
    if (book.summary !== before.summary) await remote.updateBook(id, { summary: book.summary });
    const after = await remote.getBookById(id);
    console.log(id, "pages", before.pages.length, "->", after?.pages.length, "status", after?.status);
  }
})();
