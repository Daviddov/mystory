/**
 * Copies the local library (./data: books, pages, collections, settings and
 * media files) into a Supabase project, so a new deployment does not start
 * empty. Users, favorites, progress and jobs are NOT copied.
 *
 *   1. Apply supabase/migrations to the project.
 *   2. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 *      SUPABASE_SERVICE_ROLE_KEY in the environment.
 *   3. npx tsx supabase/import-local.ts
 *
 * Safe to run again: books and collections that already exist (same id) are
 * skipped, media files are overwritten.
 */
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { bookMediaPrefix, contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

async function main(): Promise<void> {
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();

  const { books } = await local.listBooks({ status: "any" });
  let created = 0;
  let skipped = 0;
  let files = 0;
  for (const summary of books) {
    const book = await local.getBookById(summary.id);
    if (!book) continue;

    for (const mediaPath of await localMedia.list(bookMediaPrefix(book.id))) {
      const object = await localMedia.get(mediaPath);
      if (!object) continue;
      await remoteMedia.put(mediaPath, object.bytes, contentTypeForPath(mediaPath));
      files++;
    }

    if (await remote.getBookById(book.id)) {
      skipped++;
      console.log(`skip   ${book.id} (already exists)`);
      continue;
    }
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...input } = book;
    await remote.createBook(input);
    created++;
    console.log(`import ${book.id} "${book.title}" (${book.pages.length} pages)`);
  }

  let collections = 0;
  for (const collection of await local.listCollections()) {
    if (await remote.getCollectionById(collection.id)) continue;
    await remote.createCollection(collection);
    collections++;
  }

  const settings = await local.getSettings();
  const current = await remote.getSettings();
  if (settings.bookOfTheWeekId && !current.bookOfTheWeekId) {
    await remote.setSettings({ bookOfTheWeekId: settings.bookOfTheWeekId });
  }

  console.log(
    `Done: ${created} books imported, ${skipped} skipped, ${files} media files uploaded, ` +
      `${collections} collections imported.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
