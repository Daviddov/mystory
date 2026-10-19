/**
 * Cuts one narration of a whole book (made in one Gemini TTS run in AI Studio, pages separated by a blank line)
 * into one WAV per page, named <slug>-pNN.wav, ready for attach-narration.ts.
 *
 *   npx tsx .claude/skills/ai-picture-book/scripts/split-book-audio.ts <slug> <book.wav> <out-folder> [--pages 1,3]
 *
 * No speech recognition: the voice activity is detected in the audio (detectSpeech) and the words of the whole
 * text are spread over it (estimateWordTimings, the reader's own estimator, ~77% of words within 0.3 s). Each cut falls in the
 * middle of the pause before the first word of a page, so a small timing error moves a cut inside a pause, not inside a word.
 * Prints each page's duration and the length of the pause it was cut in; a page cut where there was almost no pause is flagged.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { splitWords } from "../../../../src/lib/hebrew";
import { narrationText } from "../../../../src/lib/narration/pipeline";
import { LocalRepository } from "../../../../src/lib/repo/local";
import { detectSpeech, estimateWordTimings } from "../../../../src/lib/reader/estimate-timings";

const RATE = 16000;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [slug, wav, outDir] = args;
  if (!slug || !wav || !outDir) throw new Error("usage: split-book-audio.ts <slug> <book.wav> <out-folder> [--pages 1,3]");
  const pagesIdx = args.indexOf("--pages");
  const only = pagesIdx >= 0 ? (args[pagesIdx + 1] ?? "").split(",").map(Number) : undefined;

  const repo = new LocalRepository(path.join(process.cwd(), "data"));
  const book = await repo.getBookBySlug(slug);
  if (!book) throw new Error(`no book with slug ${slug}`);
  const pages = book.pages.filter((p) => splitWords(p.text).length > 0 && (!only || only.includes(p.index + 1)));
  const texts = pages.map((p) => narrationText(p));
  const counts = texts.map((t) => splitWords(t).length);

  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], {
    maxBuffer: 1 << 30,
  });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const duration = samples.length / RATE;
  const speech = detectSpeech(samples, RATE);
  const timings = estimateWordTimings(texts.join("\n"), speech, duration);
  if (timings.length !== counts.reduce((a, b) => a + b, 0)) throw new Error("word count mismatch between text and timings");

  mkdirSync(outDir, { recursive: true });
  let at = 0;
  const cuts: number[] = [0];
  const pauses: number[] = [0];
  for (let i = 1; i < pages.length; i++) {
    at += counts[i - 1];
    const prevEnd = timings[at - 1].end;
    const nextStart = timings[at].start;
    cuts.push((prevEnd + nextStart) / 2);
    pauses.push(nextStart - prevEnd);
  }
  cuts.push(duration);

  for (let i = 0; i < pages.length; i++) {
    const n = String(pages[i].index + 1).padStart(2, "0");
    const out = path.join(outDir, `${slug}-p${n}.wav`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-ss", cuts[i].toFixed(3), "-to", cuts[i + 1].toFixed(3), "-ac", "1", out]);
    const flag = i > 0 && pauses[i] < 0.15 ? "  <-- no clear pause before this page, check the cut" : "";
    console.log(`page ${n}: ${(cuts[i + 1] - cuts[i]).toFixed(1)}s, pause before ${pauses[i].toFixed(2)}s${flag}`);
  }
  console.log(`${pages.length} pages from ${duration.toFixed(1)}s of audio -> ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
