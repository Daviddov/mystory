// One-off: replace a local book's page texts (and summary) from a rewrite json, re-vocalize only the changed pages with Dicta.
//   npx tsx scripts/_rewrite-book.ts <book dir> <rewrite.json>
import fs from "node:fs";
import { createDictaNikudProvider } from "../src/lib/ai/providers/dicta-nikud";

(async () => {
  const [dir, src] = process.argv.slice(2);
  const file = `data/books/${dir}/book.json`;
  const book = JSON.parse(fs.readFileSync(file, "utf8"));
  const rw = JSON.parse(fs.readFileSync(src, "utf8"));
  if (rw.pages.length !== book.pages.length) throw new Error("page count differs");
  const nikud = await createDictaNikudProvider();
  const changed: number[] = [];
  for (let i = 0; i < rw.pages.length; i++) {
    if (rw.pages[i] === book.pages[i].text) continue;
    book.pages[i].text = rw.pages[i];
    book.pages[i].textNikud = (await nikud.addNikud(rw.pages[i])).text;
    book.pages[i].wordTimings = [];
    changed.push(i + 1);
  }
  if (rw.summary) book.summary = rw.summary;
  book.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(book, null, 2) + "\n");
  console.log("changed pages:", changed.join(","));
  for (const i of changed) console.log(`-- p${i}\n${book.pages[i - 1].textNikud}`);
})();
