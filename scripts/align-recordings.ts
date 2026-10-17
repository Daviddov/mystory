/**
 * Exact word timings for recordings that have none, from speech recognition,
 * so the reader highlights the spoken word without its in-browser estimate.
 *
 *   npx tsx scripts/align-recordings.ts [--book <slug>]... [--recordings] [--force] [--dry-run]
 *     --book <slug>  book pages narrated with a recording (audioSource "recorded", e.g.
 *                    uploaded in the studio) of this book; repeatable
 *     --recordings   pages of the family recordings (data/recordings.json)
 *                    With neither option: every book and every family recording.
 *     --force        time again pages that already have timings
 *     --dry-run      recognize and report, write nothing
 *
 * Recognition: STT_PROVIDER (src/lib/ai/providers/stt.ts), read from the shell and then
 * from .env.local and .env. Locally, without any account:
 *   pip install faster-whisper   (Python 3.12 works; ffmpeg on the PATH)
 *   STT_PROVIDER=whisper STT_PYTHON="py -3.12" npx tsx scripts/align-recordings.ts
 *
 * The recognized words are matched to the page text with the fuzzy aligner. A page
 * whose words match too little of the text is left without timings (the reader keeps
 * estimating them). Only the local JSON repository is supported here.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createSttProvider } from "../src/lib/ai/providers/stt";
import { LocalMediaStore } from "../src/lib/media/local";
import { timingsFromRecognizedWords } from "../src/lib/narration/recognized";
import { usableTimings } from "../src/lib/reader/logic";
import { LocalRepository } from "../src/lib/repo/local";
import type { BookWithPages, WordTiming } from "../src/lib/types";

function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), file));
    } catch {
      // No such file.
    }
  }
}

/** Length of the audio in seconds, or undefined when ffprobe cannot tell (e.g. a browser webm). */
function audioDuration(file: string): number | undefined {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const seconds = Number(out.toString().trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  } catch {
    return undefined;
  }
}

interface Job {
  label: string;
  /** Media path of the audio; a page re-recorded meanwhile is not overwritten. */
  audio: string;
  file: string;
  text: string;
  /** Book id, for the recordings: the timings are stored per recording. */
  bookId: string;
  recordingId?: string;
  pageIndex: number;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const args = process.argv.slice(2);
  const slugs: string[] = [];
  let recordings = false;
  let force = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--book") {
      const slug = args[++i];
      if (!slug) throw new Error("--book needs a slug");
      slugs.push(slug);
    } else if (arg === "--recordings") recordings = true;
    else if (arg === "--force") force = true;
    else if (arg === "--dry-run") dryRun = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  const everything = slugs.length === 0 && !recordings;

  const dataDirOverride = process.env.DATA_DIR?.trim();
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);
  const stt = createSttProvider();
  console.log(`data: ${root}`);
  console.log(`stt:  ${stt.name}`);

  const books = new Map<string, BookWithPages>();
  const jobs: Job[] = [];

  const bookTargets: BookWithPages[] = [];
  if (everything) bookTargets.push(...(await repo.listAllBooksWithPages()));
  for (const slug of slugs) {
    const book = await repo.getBookBySlug(slug);
    if (!book) throw new Error(`no book with slug "${slug}"`);
    bookTargets.push(book);
  }
  for (const book of bookTargets) {
    books.set(book.id, book);
    for (const page of book.pages) {
      if (!page.audio || page.audioSource !== "recorded" || page.text.trim() === "") continue;
      if (!force && usableTimings(page)) continue;
      jobs.push({
        label: `${book.slug} p${page.index + 1}`,
        audio: page.audio,
        file: media.resolve(page.audio),
        text: page.text,
        bookId: book.id,
        pageIndex: page.index,
      });
    }
  }

  if (everything || recordings) {
    for (const recording of await repo.listRecordings()) {
      const book = books.get(recording.bookId) ?? (await repo.getBookById(recording.bookId));
      if (!book) {
        console.warn(`recording ${recording.id}: its book ${recording.bookId} does not exist, skipped`);
        continue;
      }
      books.set(book.id, book);
      for (const take of recording.pages) {
        const page = book.pages[take.index];
        if (!page || page.text.trim() === "") continue;
        if (!force && usableTimings({ ...page, audio: take.audio, wordTimings: take.wordTimings })) continue;
        jobs.push({
          label: `${book.slug} rec ${recording.id} p${take.index + 1}`,
          audio: take.audio,
          file: media.resolve(take.audio),
          text: page.text,
          bookId: book.id,
          recordingId: recording.id,
          pageIndex: take.index,
        });
      }
    }
  }

  console.log(`${jobs.length} page(s) to time\n`);
  if (jobs.length === 0) return;

  const recognized = await stt.transcribe(jobs.map((job) => ({ path: job.file })));

  const timed = new Map<Job, WordTiming[]>();
  for (const [i, job] of jobs.entries()) {
    const words = recognized[i];
    if (!words) {
      console.log(`  ${job.label}: not transcribed`);
      continue;
    }
    const result = timingsFromRecognizedWords(job.text, words, { durationSeconds: audioDuration(job.file) });
    if (!result.ok) {
      console.log(`  ${job.label}: kept the estimate (${result.reason})`);
      continue;
    }
    console.log(`  ${job.label}: ${result.wordTimings.length} words, ${result.method}, ${Math.round(result.coverage * 100)}% matched`);
    timed.set(job, result.wordTimings);
  }

  console.log(`\ntimed ${timed.size} of ${jobs.length} page(s)`);
  if (dryRun || timed.size === 0) {
    if (dryRun) console.log("dry run: nothing written");
    return;
  }

  // Book pages: one write per book, from a fresh read.
  const byBook = new Map<string, Map<string, WordTiming[]>>();
  const byRecording = new Map<string, Map<string, WordTiming[]>>();
  for (const [job, timings] of timed) {
    const target = job.recordingId ? byRecording : byBook;
    const key = job.recordingId ?? job.bookId;
    if (!target.has(key)) target.set(key, new Map());
    target.get(key)!.set(`${job.pageIndex}:${job.audio}`, timings);
  }
  for (const [bookId, pages] of byBook) {
    const book = await repo.getBookById(bookId);
    if (!book) continue;
    await repo.replacePages(
      bookId,
      book.pages.map((page) => {
        const timings = pages.get(`${page.index}:${page.audio}`);
        return timings ? { ...page, wordTimings: timings } : page;
      }),
    );
  }
  for (const [recordingId, pages] of byRecording) {
    const recording = await repo.getRecording(recordingId);
    if (!recording) continue;
    await repo.updateRecording(recordingId, {
      pages: recording.pages.map((take) => {
        const timings = pages.get(`${take.index}:${take.audio}`);
        return timings ? { ...take, wordTimings: timings } : take;
      }),
    });
  }
  console.log(`written: ${byBook.size} book(s), ${byRecording.size} recording(s)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
