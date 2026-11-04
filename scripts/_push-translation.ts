// One-off: add (or replace) a version in another language on a live Supabase book, straight from a
// translation file, without touching the Hebrew pages, their audio or the media.
//   npx tsx --env-file=.env.supabase scripts/_push-translation.ts <book id> <file.json>
// File format as for scripts/add-translation.ts: { language, title, summary, pages: [one text per page] }.
import fs from "node:fs";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import { withBookVersion, withPageVersion, type BookLanguage } from "../src/lib/types";

const [id, file] = process.argv.slice(2);
(async () => {
  const t = JSON.parse(fs.readFileSync(file, "utf8")) as { language: BookLanguage; title: string; summary?: string; pages: string[] };
  const repo = await createSupabaseRepository();
  const book = await repo.getBookById(id);
  if (!book) throw new Error("no book " + id);
  if (t.pages.length !== book.pages.length) throw new Error(`${t.pages.length} texts for ${book.pages.length} pages`);
  const version = { language: t.language, title: t.title, ...(t.summary ? { summary: t.summary } : {}) };
  const versions = withBookVersion(book, version);
  const pages = book.pages.map((page, i) => withPageVersion(versions, page, t.language, { text: t.pages[i] }));
  await repo.updateBook(id, versions);
  await repo.replacePages(id, pages);
  const after = await repo.getBookById(id);
  console.log(after?.title, "| versions:", [after?.translation, ...(after?.extraTranslations ?? [])].filter(Boolean).map((v) => v!.language).join(","),
    "| audio kept:", after?.pages.filter((p) => p.audio).length);
})();
