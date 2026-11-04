// One-off: copy a rebuilt local book (same id) onto its live Supabase copy: new media, pages and
// book details. The live owner, status and id stay as they are.
//   npx tsx --env-file=.env.supabase scripts/_push-book.ts <book id>
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

const [id] = process.argv.slice(2);
(async () => {
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();
  const book = await local.getBookById(id);
  const before = await remote.getBookById(id);
  if (!book || !before) throw new Error("missing " + id);

  const remoteFiles = new Set(await remoteMedia.list("books/" + id));
  const media = [book.coverImage, ...book.pages.flatMap((p) => [p.image, p.audio])];
  for (const m of media) {
    if (!m || remoteFiles.has(m)) continue;
    const obj = await localMedia.get(m);
    if (!obj) throw new Error("no local file " + m);
    await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
    console.log("  uploaded", m);
  }
  await remote.replacePages(id, book.pages);
  await remote.updateBook(id, {
    title: book.title,
    summary: book.summary,
    ageGroup: book.ageGroup,
    categories: book.categories,
    themes: book.themes,
    tags: book.tags,
    discussionQuestions: book.discussionQuestions,
    coverImage: book.coverImage,
    readingMinutes: book.readingMinutes,
    illustrator: book.illustrator,
    author: book.author,
  });
  const after = await remote.getBookById(id);
  console.log(id, after?.title, "pages", before.pages.length, "->", after?.pages.length, "status", after?.status);
})();
