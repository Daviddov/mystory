// One-off: set a live book's hero (description, style, character sheet) from a local PNG.
//   npx tsx --env-file=.env.supabase scripts/_set-hero.ts <book id> <sheet.png> <style> <description>
import { readFile } from "node:fs/promises";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { storeImage } from "../src/lib/media/optimize";
import { bookMediaPath } from "../src/lib/media/url";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

const [id, png, style, description] = process.argv.slice(2);
(async () => {
  const repo = await createSupabaseRepository();
  const book = await repo.getBookById(id);
  if (!book) throw new Error("no book " + id);
  const stored = await storeImage(await createSupabaseMediaStore(), bookMediaPath(id, "character.png"), new Uint8Array(await readFile(png)), "image/png");
  await repo.updateBook(id, { hero: { ...book.hero, description, style, image: stored.path } });
  console.log("hero ->", stored.path);
})();
