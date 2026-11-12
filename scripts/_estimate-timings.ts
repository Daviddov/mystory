// One-off: gives the narrated pages of a book (own-language pages) estimated word timings from the audio's pauses,
// for languages the local Whisper model (Hebrew-tuned) cannot time. Usage: npx tsx scripts/_estimate-timings.ts <slug>
import { execFileSync } from "node:child_process";
import path from "node:path";
import { dataDir } from "../src/lib/config";
import { detectSpeech, estimateWordTimings } from "../src/lib/reader/estimate-timings";
import { LocalRepository } from "../src/lib/repo/local";

(async () => {
  const repo = new LocalRepository(dataDir());
  const book = await repo.getBookBySlug(process.argv[2]);
  if (!book) throw new Error("no book");
  const pages = [];
  for (const page of book.pages) {
    if (!page.audio) {
      pages.push(page);
      continue;
    }
    const file = path.join(dataDir(), "media", page.audio);
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], { maxBuffer: 1 << 28 });
    const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    const timings = estimateWordTimings(page.text, detectSpeech(samples, 16000), samples.length / 16000);
    console.log(`page ${page.index + 1}: ${timings.length} words, ${(samples.length / 16000).toFixed(1)}s`);
    pages.push({ ...page, wordTimings: timings });
  }
  await repo.replacePages(book.id, pages);
})();
