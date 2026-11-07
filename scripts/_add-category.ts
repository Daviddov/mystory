// One-off: add a category to books in Supabase and in the local data directory (when the book is there).
//   tsx scripts/_add-category.ts <category> <bookId>...
import { dataDir } from "../src/lib/config";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import { CATEGORIES } from "../src/lib/taxonomy";

for (const f of [".env.supabase", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

const [category, ...ids] = process.argv.slice(2);
if (!CATEGORIES.some((c) => c.slug === category) || ids.length === 0) {
  console.error("usage: tsx scripts/_add-category.ts <category> <bookId>...");
  process.exit(2);
}

(async () => {
  const remote = await createSupabaseRepository();
  const local = new LocalRepository(dataDir());
  for (const id of ids) {
    for (const [where, repo] of [["remote", remote], ["local", local]] as const) {
      const book = await repo.getBookById(id);
      if (!book) {
        console.log(id, where, "missing");
        continue;
      }
      if (book.categories.includes(category)) {
        console.log(id, where, "already");
        continue;
      }
      await repo.updateBook(id, { categories: [...book.categories, category] });
      console.log(id, where, "added", book.title);
    }
  }
})();
