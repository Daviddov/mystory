// One-off: create a local book on the live Supabase site (media, pages, versions in other
// languages), owned by a live user and private until they publish it. Refuses an existing id or slug.
//   npx tsx --env-file=.env.supabase scripts/_create-live-book.ts <book id> <live owner id>
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

const [id, ownerId] = process.argv.slice(2);
(async () => {
  if (!id || !ownerId) throw new Error("usage: _create-live-book.ts <book id> <live owner id>");
  const book = await new LocalRepository(dataDir()).getBookById(id);
  if (!book) throw new Error("no local book " + id);
  const remote = await createSupabaseRepository();
  if ((await remote.getBookById(id)) || (await remote.getBookBySlug(book.slug))) throw new Error(`${id} / ${book.slug} already exists live`);

  const localMedia = new LocalMediaStore(dataDir());
  const remoteMedia = await createSupabaseMediaStore();
  const versions = [book.translation, ...(book.extraTranslations ?? [])].filter(Boolean).map((v) => v!.language);
  const media = new Set<string>([
    book.coverImage,
    book.hero?.image,
    book.soundtrack,
    ...book.pages.flatMap((p) => [p.image, p.audio, ...versions.map((l) => (book.translation?.language === l ? p.translation : p.extraTranslations?.[l])?.audio)]),
  ].filter((m): m is string => !!m));
  for (const m of media) {
    const obj = await localMedia.get(m);
    if (!obj) throw new Error("no local file " + m);
    await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
  }
  console.log("uploaded", media.size, "files");

  const { createdAt: _c, updatedAt: _u, ...rest } = book as typeof book & { createdAt?: string; updatedAt?: string };
  const created = await remote.createBook({ ...rest, ownerId, status: "private" });
  console.log(created.id, created.slug, created.title, "| pages", created.pages.length, "| audio", created.pages.filter((p) => p.audio).length,
    "| versions", versions.join(","), "| status", created.status);
})();
