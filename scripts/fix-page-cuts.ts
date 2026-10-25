/**
 * Finds and fixes recorded books whose page audio was cut at the wrong place (a whole-book narration
 * split by split-book-audio.ts that guessed a cut inside the neighbouring page, e.g. around numbers).
 *
 *   npx tsx scripts/fix-page-cuts.ts [--book <slug>]... [--apply] [--threshold 0.6]
 *
 * The pages' audio is joined back into one recording, recognized as a whole (STT_PROVIDER, see
 * align-recordings.ts), matched to the whole text, and every page is cut again in the quietest spot
 * between its last word and the next page's first word. Without --apply it only reports how far each
 * cut would move. With --apply books whose cuts move by more than --threshold seconds get new page
 * audio (and word timings) written.
 *
 *   STT_PROVIDER=whisper STT_PYTHON="py -3.12" npx tsx scripts/fix-page-cuts.ts
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSttProvider } from "../src/lib/ai/providers/stt";
import { splitWords } from "../src/lib/hebrew";
import { LocalMediaStore } from "../src/lib/media/local";
import { timingsFromRecognizedWords } from "../src/lib/narration/recognized";
import { LocalRepository } from "../src/lib/repo/local";
import type { BookWithPages, Page, WordTiming } from "../src/lib/types";

const RATE = 16000;

function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), file));
    } catch {
      // No such file.
    }
  }
}

function decode(file: string): Float32Array {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], {
    maxBuffer: 1 << 30,
  });
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}

/** The quietest 20 ms inside [from, to] seconds. */
function quietest(samples: Float32Array, from: number, to: number): number {
  const hop = Math.round(RATE * 0.02);
  const a = Math.max(0, Math.floor(from * RATE));
  const b = Math.min(samples.length - hop, Math.floor(to * RATE));
  let best = (from + to) / 2;
  let bestEnergy = Infinity;
  for (let i = a; i <= b; i += hop / 2) {
    let e = 0;
    for (let j = 0; j < hop; j++) e += samples[i + j] * samples[i + j];
    if (e < bestEnergy) {
      bestEnergy = e;
      best = (i + hop / 2) / RATE;
    }
  }
  return best;
}

interface Prepared {
  book: BookWithPages;
  pages: Page[];
  samples: Float32Array;
  oldCuts: number[];
  wav: string;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const args = process.argv.slice(2);
  const slugs: string[] = [];
  let apply = false;
  let threshold = 0.6;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--book") slugs.push(args[++i]);
    else if (args[i] === "--apply") apply = true;
    else if (args[i] === "--threshold") threshold = Number(args[++i]);
    else throw new Error(`unknown argument ${args[i]}`);
  }
  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);
  const stt = createSttProvider();
  const tmp = mkdtempSync(path.join(tmpdir(), "cuts-"));

  const books: BookWithPages[] = [];
  if (slugs.length === 0) books.push(...(await repo.listAllBooksWithPages()));
  else
    for (const slug of slugs) {
      const book = await repo.getBookBySlug(slug);
      if (!book) throw new Error(`no book ${slug}`);
      books.push(book);
    }

  const prepared: Prepared[] = [];
  for (const book of books) {
    const withText = book.pages.filter((p) => splitWords(p.text).length > 0);
    if (withText.length < 2 || !withText.every((p) => p.audio && p.audioSource === "recorded")) continue;
    const parts = withText.map((p) => decode(media.resolve(p.audio!)));
    const total = parts.reduce((a, p) => a + p.length, 0);
    const samples = new Float32Array(total);
    const oldCuts = [0];
    let at = 0;
    for (const part of parts) {
      samples.set(part, at);
      at += part.length;
      oldCuts.push(at / RATE);
    }
    const wav = path.join(tmp, `${book.slug}.wav`);
    const rawFile = `${wav}.f32`;
    writeFileSync(rawFile, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", rawFile, wav]);
    rmSync(rawFile);
    prepared.push({ book, pages: withText, samples, oldCuts, wav });
  }
  console.log(`${prepared.length} recorded book(s) to check`);
  if (prepared.length === 0) return;

  const recognized = await stt.transcribe(prepared.map((p) => ({ path: p.wav })));

  for (const [bi, item] of prepared.entries()) {
    const { book, pages, samples, oldCuts } = item;
    const words = recognized[bi];
    const label = book.slug;
    if (!words) {
      console.log(`${label}: not transcribed`);
      continue;
    }
    const duration = samples.length / RATE;
    const result = timingsFromRecognizedWords(pages.map((p) => p.text).join("\n"), words, {
      durationSeconds: duration,
      minCoverage: 0.5,
    });
    if (!result.ok) {
      console.log(`${label}: SKIPPED, ${result.reason}`);
      continue;
    }
    const counts = pages.map((p) => splitWords(p.text).length);
    const timings = result.wordTimings;
    const newCuts = [0];
    let wordAt = 0;
    for (let i = 1; i < pages.length; i++) {
      wordAt += counts[i - 1];
      const prevEnd = timings[wordAt - 1].end;
      const nextStart = timings[wordAt].start;
      const lo = Math.min(prevEnd, nextStart);
      const hi = Math.max(prevEnd, nextStart);
      newCuts.push(quietest(samples, lo - 0.1, hi + 0.1));
    }
    newCuts.push(duration);
    const shifts = newCuts.map((c, i) => c - oldCuts[i]);
    const worst = Math.max(...shifts.map(Math.abs));
    const worstPage = shifts.map(Math.abs).indexOf(worst) + 1;
    const flag = worst > threshold ? "  <-- WRONG CUTS" : "";
    console.log(
      `${label}: ${Math.round(result.coverage * 100)}% matched, biggest cut move ${worst.toFixed(2)}s (before page ${worstPage})${flag}`,
    );
    if (!apply || worst <= threshold) continue;
    if (result.coverage < 0.7) {
      console.log(`  ${label}: not rewritten, too little matched to trust the new cuts (check by hand)`);
      continue;
    }

    const outPages = book.pages.map((p) => p);
    for (const [i, page] of pages.entries()) {
      const from = newCuts[i];
      const to = newCuts[i + 1];
      const slice = samples.subarray(Math.round(from * RATE), Math.round(to * RATE));
      const rawFile = path.join(tmp, "slice.f32");
      writeFileSync(rawFile, Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
      const mp3 = path.join(tmp, "slice.mp3");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", rawFile, "-codec:a", "libmp3lame", "-b:a", "96k", mp3]);
      const bytes = readFileSync(mp3);
      const n = String(page.index + 1).padStart(2, "0");
      const name = `narration-${n}-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.mp3`;
      const audio = `books/${book.id}/${name}`;
      mkdirSync(path.join(root, "media", "books", book.id), { recursive: true });
      writeFileSync(path.join(root, "media", audio), bytes);

      const start = counts.slice(0, i).reduce((a, b) => a + b, 0);
      const pageTimings: WordTiming[] = timings.slice(start, start + counts[i]).map((t) => ({
        word: t.word,
        start: Math.max(0, +(t.start - from).toFixed(3)),
        end: Math.max(0, +(Math.min(t.end, to) - from).toFixed(3)),
      }));
      const { wordTimings: _old, ...keep } = outPages[page.index];
      outPages[page.index] = { ...keep, audio, wordTimings: pageTimings };
    }
    await repo.replacePages(book.id, outPages);
    console.log(`  ${label}: rewrote ${pages.length} page(s)`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
