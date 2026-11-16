// One-off: push a book's new page animation clips (and any other new page media) to Supabase, then replace its pages.
//   npx tsx --env-file=.env.supabase scripts/_push-videos.ts <book id> [...]
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
      for (const m of [p.image, p.audio, p.video]) {
        if (!m || remoteFiles.has(m)) continue;
        const obj = await localMedia.get(m);
        if (!obj) throw new Error("no local file " + m);
        await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
        console.log("  uploaded", m);
      }
    }
    await remote.replacePages(id, book.pages);
    const after = await remote.getBookById(id);
    console.log(id, "pages", before.pages.length, "->", after?.pages.length, "videos", after?.pages.filter((p) => p.video).length);
  }
})();
