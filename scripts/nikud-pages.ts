/**
 * Adds textNikud (Dicta Nakdan) to the pages of the given books, without narration.
 *   npx tsx scripts/nikud-pages.ts <slugs-json-file>
 */
import fs from "node:fs";
import path from "node:path";
import { createDictaNikudProvider } from "../src/lib/ai/providers/dicta-nikud";

async function main(): Promise<void> {
  const slugs: string[] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const nikud = await createDictaNikudProvider();
  for (const slug of slugs) {
    const file = path.join(process.cwd(), "data", "books", slug, "book.json");
    const book = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const page of book.pages) {
      if (!page.text || !page.text.trim()) continue;
      const result = await nikud.addNikud(page.text);
      page.textNikud = result.text;
    }
    fs.writeFileSync(file, JSON.stringify(book, null, 2) + "\n");
    console.log(slug, "ok");
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
