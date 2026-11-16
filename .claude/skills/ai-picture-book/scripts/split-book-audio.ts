/**
 * Cuts one narration of a whole book (made in one Gemini TTS run in AI Studio, pages separated by a blank line)
 * into one WAV per page, named <slug>-pNN.wav, ready for attach-narration.ts.
 *
 *   npx tsx .claude/skills/ai-picture-book/scripts/split-book-audio.ts <slug> <book.wav> <out-folder> [--pages 1,3] [--translation]
 *
 * With STT_PROVIDER=whisper (and STT_PYTHON, e.g. "py -3.12") the whole audio is recognized and each page starts where its first
 * words were really heard (the estimator drifts: on 2026-11-15 pages 5-9 of a book were cut a sentence off). The voice may also
 * read sentences that are not in the text; a run of 4+ recognized words that match nothing is cut out and the rest is joined
 * with a short pause (--keep-extras turns this off). Without STT_PROVIDER the estimator below is used.
 *
 * --translation: the audio reads the book's second-language version (Page.translation.text), for scripts/add-translation.ts --audio.
 *
 * No speech recognition: the voice activity is detected in the audio (detectSpeech) and the words of the whole
 * text are spread over it (estimateWordTimings, the reader's own estimator, ~77% of words within 0.3 s). Each cut falls in the
 * middle of the pause before the first word of a page, so a small timing error moves a cut inside a pause, not inside a word.
 * Prints each page's duration and the length of the pause it was cut in; a page cut where there was almost no pause is flagged.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createSttProvider } from "../../../../src/lib/ai/providers/stt";
import path from "node:path";
import { splitWords } from "../../../../src/lib/hebrew";
import { narrationText } from "../../../../src/lib/narration/pipeline";
import { LocalRepository } from "../../../../src/lib/repo/local";
import { detectSpeech, estimateWordTimings } from "../../../../src/lib/reader/estimate-timings";

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

const letters = (s: string) => s.replace(/[^א-ת]/g, "");

/** Longest common subsequence of two word lists: expected index -> recognized index. */
function matchWords(exp: string[], rec: string[]): Map<number, number> {
  const n = exp.length,
    m = rec.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = exp[i] === rec[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Map<number, number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (exp[i] === rec[j]) map.set(i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

interface Piece {
  from: number;
  to: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [slug, wav, outDir] = args;
  if (!slug || !wav || !outDir) throw new Error("usage: split-book-audio.ts <slug> <book.wav> <out-folder> [--pages 1,3] [--translation]");
  const translation = args.includes("--translation");
  const pagesIdx = args.indexOf("--pages");
  const only = pagesIdx >= 0 ? (args[pagesIdx + 1] ?? "").split(",").map(Number) : undefined;

  const repo = new LocalRepository(path.join(process.cwd(), "data"));
  const book = await repo.getBookBySlug(slug);
  if (!book) throw new Error(`no book with slug ${slug}`);
  const spoken = (p: (typeof book.pages)[number]) => (translation ? (p.translation?.text ?? "") : narrationText(p));
  const pages = book.pages.filter((p) => splitWords(spoken(p)).length > 0 && (!only || only.includes(p.index + 1)));
  const texts = pages.map(spoken);
  const counts = texts.map((t) => splitWords(t).length);

  loadEnvFiles();
  const useStt = (process.env.STT_PROVIDER ?? "").trim() !== "";
  const keepExtras = args.includes("--keep-extras");
  mkdirSync(outDir, { recursive: true });

  if (useStt) {
    const cutPieces = (pieces: Piece[], out: string) => {
      if (pieces.length === 1) {
        execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-ss", pieces[0].from.toFixed(3), "-to", pieces[0].to.toFixed(3), "-ac", "1", out]);
        return;
      }
      const trims = pieces.map((p, k) => `[0:a]atrim=${p.from.toFixed(3)}:${p.to.toFixed(3)},asetpts=PTS-STARTPTS[a${k}]`);
      const silences = pieces.slice(1).map((_, k) => `aevalsrc=0:d=0.35:s=24000[s${k}]`);
      const order = pieces.map((_, k) => (k ? `[s${k - 1}][a${k}]` : `[a${k}]`)).join("");
      const filter = `${[...trims, ...silences].join(";")};${order}concat=n=${pieces.length * 2 - 1}:v=0:a=1[o]`;
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-filter_complex", filter, "-map", "[o]", "-ar", "24000", "-ac", "1", out]);
    };
    const stt = createSttProvider();
    console.log(`recognizing the whole audio with ${stt.name} ...`);
    const [recognized] = await stt.transcribe([{ path: path.resolve(wav) }]);
    if (!recognized) throw new Error("speech recognition returned nothing");
    const rec = recognized.map((w) => ({ w: letters(w.word), start: w.start, end: w.end })).filter((r) => r.w);
    const exp: string[] = [];
    const owner: number[] = [];
    texts.forEach((t, pi) =>
      splitWords(t).forEach((w) => {
        const l = letters(w);
        if (l) {
          exp.push(l);
          owner.push(pi);
        }
      }),
    );
    const match = matchWords(exp, rec.map((r) => r.w));
    const matchedRec = new Set(match.values());
    console.log(`matched ${match.size} of ${exp.length} expected words (${rec.length} recognized)`);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString().trim());
    // Where each page really starts: its first matched word among the first 6, stepped back to the page's first word.
    const startRec: number[] = [0];
    for (let pi = 1; pi < pages.length; pi++) {
      const idx = exp.map((_, e) => e).filter((e) => owner[e] === pi);
      const r = idx.slice(0, 6).map((e, j) => (match.has(e) ? match.get(e)! - j : -1)).find((x) => x > 0);
      if (r === undefined) throw new Error(`page ${pages[pi].index + 1}: its first words were not heard, cannot place the cut (unset STT_PROVIDER to use the estimator)`);
      startRec.push(r);
    }
    const cuts = [0, ...startRec.slice(1).map((r) => (rec[r - 1].end + rec[r].start) / 2), duration];
    for (let i = 0; i < pages.length; i++) {
      const n = String(pages[i].index + 1).padStart(2, "0");
      const out = path.join(outDir, `${slug}-p${n}.wav`);
      // Runs of 4+ recognized words that match nothing inside the page are sentences the voice added.
      const lo = startRec[i];
      const hi = i + 1 < pages.length ? startRec[i + 1] : rec.length;
      const pieces: Piece[] = [];
      let from = cuts[i];
      let r = lo;
      while (!keepExtras && r < hi) {
        if (matchedRec.has(r)) {
          r++;
          continue;
        }
        let e = r;
        while (e < hi && !matchedRec.has(e)) e++;
        if (e - r >= 4 && r > lo && e < hi) {
          pieces.push({ from, to: rec[r - 1].end + 0.15 });
          from = rec[e].start - 0.1;
          console.log(`page ${n}: cut out ${e - r} extra words (${rec[r].start.toFixed(1)}s-${rec[e - 1].end.toFixed(1)}s)`);
        }
        r = e;
      }
      pieces.push({ from, to: cuts[i + 1] });
      cutPieces(pieces, out);
      let heard = 0;
      exp.forEach((_, e) => {
        if (owner[e] === i && match.has(e)) heard++;
      });
      const share = heard / Math.max(1, counts[i]);
      const secs = pieces.reduce((a, p) => a + p.to - p.from, 0);
      console.log(`page ${n}: ${secs.toFixed(1)}s, ${Math.round(share * 100)}% of words heard${share < 0.7 ? "  <-- check this page" : ""}`);
    }
    console.log(`${pages.length} pages from ${duration.toFixed(1)}s of audio -> ${outDir}`);
    return;
  }

  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], {
    maxBuffer: 1 << 30,
  });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const duration = samples.length / RATE;
  const speech = detectSpeech(samples, RATE);
  const timings = estimateWordTimings(texts.join("\n"), speech, duration);
  if (timings.length !== counts.reduce((a, b) => a + b, 0)) throw new Error("word count mismatch between text and timings");

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
