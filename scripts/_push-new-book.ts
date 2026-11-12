// One-off: copy a local book that does not exist on live yet onto Supabase (media, book, pages).
// Owner, slug and status are given on the command line.
//   npx tsx --env-file=.env.supabase scripts/_push-new-book.ts <book id> <owner id> <slug> <status>
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import type { BookStatus } from "../src/lib/types";

const [id, ownerId, slug, status] = process.argv.slice(2);
(async () => {
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();
  const book = await local.getBookById(id);
  if (!book) throw new Error("no local book " + id);
  if (await remote.getBookById(id)) throw new Error("already on live: " + id);
  if (await remote.getBookBySlug(slug)) throw new Error("slug taken on live: " + slug);

  const media = [book.coverImage, book.hero?.image, ...book.pages.flatMap((p) => [p.image, p.audio])];
  for (const m of media) {
    if (!m) continue;
    const obj = await localMedia.get(m);
    if (!obj) throw new Error("no local file " + m);
    await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
    console.log("  uploaded", m);
  }
  const { pages, hasAudio: _h, shareToken: _s, ...rest } = book;
  const created = await remote.createBook({ ...rest, slug, ownerId, status: status as BookStatus, viewCount: 0, pages });
  console.log(created.id, created.slug, created.status, "pages", created.pages.length);
})();
