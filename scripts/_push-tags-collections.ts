// One-off (2026-11-08): push retagged books (tags only) and the merged collections to Supabase.
//   tsx scripts/_push-tags-collections.ts [--write]
import { dataDir } from "../src/lib/config";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

const write = process.argv.includes("--write");
(async () => {
  const local = new LocalRepository(dataDir());
  const remote = await createSupabaseRepository();
  const remoteIds = new Set<string>();
  let changed = 0, missing = 0;
  for (const b of (await local.listBooks({ status: "any", limit: 5000 } as never)).books ?? []) {
    const r = await remote.getBookById(b.id);
    if (!r) { missing++; continue; }
    remoteIds.add(b.id);
    if (JSON.stringify(r.tags) === JSON.stringify(b.tags)) continue;
    changed++;
    if (write) await remote.updateBook(b.id, { tags: b.tags });
  }
  console.log(`books: ${changed} tag updates, ${missing} not on remote`);
  for (const c of await local.listCollections()) {
    const ids = c.bookIds.filter((id) => remoteIds.has(id));
    if (ids.length !== c.bookIds.length) console.log(`  ${c.id}: ${c.bookIds.length - ids.length} books not on remote`);
    const exists = await remote.getCollectionById(c.id);
    console.log(`collection ${c.id}: ${exists ? "update" : "create"} (${ids.length} books)`);
    if (write) {
      const data = { ...c, bookIds: ids };
      if (exists) await remote.updateCollection(c.id, data); else await remote.createCollection(data);
    }
  }
})();
