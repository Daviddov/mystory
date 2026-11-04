// One-off: re-attach Gemini narration files that are still in a live book's storage to its pages
// (after a stale save dropped the links), with the same estimated word timings the narration
// pipeline stores for Gemini. WAV only (24 kHz 16-bit mono, as Gemini TTS returns).
//   npx tsx --env-file=.env.supabase scripts/_relink-narration.ts <book id>
import { estimateWordTimings } from "../src/lib/ai/providers/gemini-tts";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { narrationText } from "../src/lib/narration/pipeline";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

const [id] = process.argv.slice(2);
(async () => {
  const repo = await createSupabaseRepository();
  const media = await createSupabaseMediaStore();
  const book = await repo.getBookById(id);
  if (!book) throw new Error("no book " + id);
  const files = await media.list("books/" + id);
  const pages = [];
  for (const page of book.pages) {
    const nn = String(page.index + 1).padStart(2, "0");
    const path = files.find((f) => new RegExp(`/narration-${nn}-[0-9a-f]+\\.wav$`).test(f));
    if (page.audio || !path) { pages.push(page); continue; }
    const obj = await media.get(path);
    if (!obj) throw new Error("cannot read " + path);
    const seconds = (obj.bytes.byteLength - 44) / 48000;
    pages.push({ ...page, audio: path, audioSource: "tts" as const, wordTimings: estimateWordTimings(narrationText(page), seconds) });
    console.log(`page ${page.index + 1}: ${path} (${seconds.toFixed(1)} s)`);
  }
  await repo.replacePages(id, pages);
  const after = await repo.getBookById(id);
  console.log("pages with audio:", after?.pages.filter((p) => p.audio).length);
})();
