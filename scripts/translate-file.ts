/**
 * Translates imported books into Hebrew from translation FILES, for when the
 * translation is written outside the site (by a person or by an assistant)
 * instead of by the configured text provider.
 *
 *   tsx scripts/translate-file.ts --pending                    list the books that wait for translation
 *   tsx scripts/translate-file.ts --export <bookId> [<dir>]    write <dir>/<bookId>.source.json: what to translate
 *   tsx scripts/translate-file.ts --apply <bookId> <file>      store the translation of <file>
 *     --translator <name>   who is credited. Default: the site's machine translation credit.
 *
 * A translation file is JSON: { "title": "...", "summary": "...", "pages": [{ "page": 1, "text": "..." }, ...] }
 * with exactly one text per page of the source file, numbered from 1 in order.
 *
 * --apply goes through translateBook(), so the same checks and the same
 * storage apply as for a translation made in the studio: the page count must
 * match, every text must be Hebrew, the source text is kept in originalText
 * and the translator is credited. A file that fails the checks changes nothing.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TextProvider, TextRequest, TextResult } from "../src/lib/ai/types";
import { LocalMediaStore } from "../src/lib/media/local";
import type { MediaStore } from "../src/lib/media/types";
import { LocalRepository } from "../src/lib/repo/local";
import type { Repository } from "../src/lib/repo/types";
import { TranslationError, translateBook, translationSource } from "../src/lib/translation";
import { needsTranslation } from "../src/lib/types";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

const USAGE = "usage: tsx scripts/translate-file.ts --pending | --export <bookId> [<dir>] | --apply <bookId> <file> [--translator <name>]";

async function openStorage(): Promise<{ repo: Repository; media: MediaStore }> {
  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    const [{ createSupabaseRepository }, { createSupabaseMediaStore }] = await Promise.all([
      import("../src/lib/repo/supabase"),
      import("../src/lib/media/supabase"),
    ]);
    return { repo: await createSupabaseRepository(), media: await createSupabaseMediaStore() };
  }
  const dataDirOverride = env("DATA_DIR");
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  return { repo: new LocalRepository(root), media: new LocalMediaStore(root) };
}

/** A text provider whose one answer is the content of a file. translateBook() validates it like a model answer. */
function fileProvider(file: string): TextProvider {
  return {
    name: "translation-file",
    isMock: false,
    async generate<T>(request: TextRequest<T>): Promise<TextResult<T>> {
      const raw = (await readFile(file, "utf8")).replace(/^﻿/, "");
      return { data: request.schema.parse(JSON.parse(raw)), isMock: false };
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { repo, media } = await openStorage();

  if (args[0] === "--pending") {
    const { books } = await repo.listBooks({ status: "any" });
    const pending = books.filter((book) => needsTranslation(book));
    for (const book of pending) console.log(`${book.id.padEnd(28)} ${book.license.padEnd(12)} ${book.title}`);
    console.log(`\n${pending.length} books wait for translation`);
    return;
  }

  if (args[0] === "--export" && args[1]) {
    const book = await repo.getBookById(args[1]);
    if (!book) throw new Error(`no book with the id ${args[1]}`);
    const source = translationSource(book);
    if (!source || !needsTranslation(book)) throw new Error(`${book.id} has nothing to translate`);
    const dir = path.resolve(args[2] ?? ".");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${book.id}.source.json`);
    const payload = {
      bookId: book.id,
      title: source.title,
      blurb: source.summary || null,
      ageGroup: book.ageGroup,
      pageCount: source.pages.length,
      pages: source.pages.map((page, i) => ({ page: i + 1, illustration: page.imageAlt ?? null, text: page.text })),
    };
    await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(file);
    return;
  }

  if (args[0] === "--apply" && args[1] && args[2]) {
    const flag = args.indexOf("--translator");
    const translator = flag >= 0 ? args[flag + 1] : undefined;
    const result = await translateBook({ repo, text: fileProvider(path.resolve(args[2])), media }, args[1], { translator });
    if (result.status !== "translated") throw new Error("the translation was not stored");
    console.log(`translated: ${result.book.id} "${result.book.title}" (${result.book.pages.length} pages), translator: ${result.book.credits?.translator}`);
    return;
  }

  console.error(USAGE);
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof TranslationError ? `${err.message}${err.detail ? `\n${err.detail}` : ""}` : err instanceof Error ? err.message : err);
  process.exit(1);
});
