/**
 * Makes a picture book from a LibriVox recording: the English book plays the
 * original recording, one clip per page with word timings, and a Hebrew
 * version of the same book shares its pictures (narrate it with narrate.ts).
 *
 *   npx tsx scripts/import-librivox.ts scripts/librivox/<name>.json [--force] [--only en|he]
 *     --force   replace books that already exist (their media folders are rewritten)
 *     --only    create just one of the two versions
 *
 * Before running:
 *   1. Word timings: python -I scripts/librivox/transcribe.py <audio.mp3> scripts/librivox/<name>.words.json
 *      (the manifest's audio.words). The importer aligns them to the page texts.
 *   2. Pictures (optional, pages stay without a picture when missing):
 *      data/media/books/<en.id>/cover and page-NN as .webp or .jpg, e.g. stored from Gemini's
 *      PNGs by scripts/lib/book-images.ts (as attach-images.ts does). The Hebrew book gets copies.
 *
 * LibriVox recordings are public domain; the manifest names the reader, who is credited.
 * Only the story's text is cut out of the recording: the LibriVox preamble ("Chapter 30
 * of ... This is a LibriVox recording ...") and the closing are left out.
 *
 * The books are drafts owned by the library ("system"); the English one can never be
 * published (only Hebrew books enter the library). Local data directory only.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { splitWords } from "../src/lib/hebrew";
import { LocalMediaStore } from "../src/lib/media/local";
import { bookMediaPath, bookMediaPrefix } from "../src/lib/media/url";
import { alignWords } from "../src/lib/narration/align";
import { LocalRepository } from "../src/lib/repo/local";
import type { AgeGroup, Page, WordTiming } from "../src/lib/types";
import { SYSTEM_OWNER_ID } from "../src/lib/types";

interface Manifest {
  audio: { url: string; reader: string; project: string; words: string };
  textSource: string;
  author: string;
  translator?: string;
  ageGroup: AgeGroup;
  categories: string[];
  themes: string[];
  en: { id: string; slug: string; title: string; summary: string };
  he: { id: string; slug: string; title: string; summary: string; tags: string[]; discussionQuestions: string[] };
  pages: { en: string; he: string; altEn: string; altHe: string }[];
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/** Silence kept before the first word and after the last word of the story. */
const LEAD_IN = 0.25;
const TAIL = 0.8;

const fold = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, "");

function ffmpeg(args: string[]): Buffer {
  return execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });
}

function audioDuration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim());
}

async function download(url: string, file: string): Promise<void> {
  if (existsSync(file)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/**
 * The recognised words of the story itself: drops the LibriVox preamble, which ends
 * right before the story's first word, and anything after the story's last word.
 */
function storyWords(words: WhisperWord[], text: string): WhisperWord[] {
  const tokens = splitWords(text).map(fold).filter(Boolean);
  const first = tokens.slice(0, 3).join(" ");
  const start = words.findIndex((_, i) =>
    words.slice(i, i + 3).map((w) => fold(w.word)).join(" ") === first,
  );
  if (start < 0) throw new Error(`the recording has no words "${first}": is it the right chapter?`);
  const last = tokens.slice(-2).join(" ");
  let end = words.length;
  for (let i = words.length - 2; i >= start; i--) {
    if (words.slice(i, i + 2).map((w) => fold(w.word)).join(" ") === last) {
      end = i + 2;
      break;
    }
  }
  return words.slice(start, end);
}

/** One timing per token of the whole story, from the recognised words. */
function timeStory(words: WhisperWord[], text: string): WordTiming[] {
  const characters: string[] = [];
  const startTimes: number[] = [];
  const endTimes: number[] = [];
  for (const w of words) {
    // Spread the word's span over its letters, so a long word is not timed as one instant.
    const letters = [...w.word];
    const step = (w.end - w.start) / Math.max(1, letters.length);
    letters.forEach((ch, i) => {
      characters.push(ch);
      startTimes.push(w.start + i * step);
      endTimes.push(w.start + (i + 1) * step);
    });
    characters.push(" ");
    startTimes.push(w.end);
    endTimes.push(w.end);
  }
  const { wordTimings, method } = alignWords(text, { characters, startTimes, endTimes });
  if (method === "proportional") throw new Error("the recording could not be aligned with the text");
  return wordTimings;
}

interface Clip {
  start: number;
  end: number;
  timings: WordTiming[];
}

/** The pauses of the recording, as ffmpeg's silencedetect hears them (it logs to stderr). */
function detectSilences(file: string): { start: number; end: number }[] {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const found: { start: number; end: number }[] = [];
  let start: number | undefined;
  for (const line of result.stderr.split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/);
    if (s) start = Number(s[1]);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (e && start !== undefined) {
      found.push({ start, end: Number(e[1]) });
      start = undefined;
    }
  }
  return found;
}

/**
 * Where to cut between a page that ends at `lastEnd` and the next that starts at
 * `nextStart`: the middle of the longest pause near that gap (word timestamps can
 * run into the pause), else the middle of the gap.
 */
function cutPoint(lastEnd: number, nextStart: number, pauses: { start: number; end: number }[]): number {
  const near = pauses.filter((p) => p.end > lastEnd - 0.5 && p.start < nextStart + 0.5);
  if (near.length === 0) return (lastEnd + nextStart) / 2;
  const longest = near.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return (longest.start + longest.end) / 2;
}

/** Cuts the story into page clips in the pauses between pages. */
function pageClips(manifest: Manifest, timings: WordTiming[], duration: number, pauses: { start: number; end: number }[]): Clip[] {
  const counts = manifest.pages.map((page) => splitWords(page.en).length);
  const ranges: WordTiming[][] = [];
  let at = 0;
  for (const count of counts) {
    ranges.push(timings.slice(at, at + count));
    at += count;
  }
  const cuts = ranges.slice(1).map((range, i) => cutPoint(ranges[i][ranges[i].length - 1].end, range[0].start, pauses));
  return ranges.map((range, i) => {
    const first = range[0];
    const last = range[range.length - 1];
    const start = i > 0 ? cuts[i - 1] : Math.max(0, first.start - LEAD_IN);
    // The story's end: stop in the first pause after the last word, before the LibriVox closing.
    const after = pauses.find((p) => p.start >= last.end - 0.3);
    const end = i < cuts.length ? cuts[i] : Math.min(duration, last.end + TAIL, after ? (after.start + after.end) / 2 : Infinity);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
      start,
      end,
      timings: range.map((t) => ({
        word: t.word,
        start: round(Math.max(0, t.start - start)),
        end: round(Math.max(0, t.end - start)),
      })),
    };
  });
}

function pageFile(index: number, ext: string): string {
  return `page-${String(index + 1).padStart(2, "0")}.${ext}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const manifestPath = args.find((a) => a.endsWith(".json"));
  if (!manifestPath) throw new Error("usage: import-librivox.ts <manifest.json> [--force] [--only en|he]");
  const force = args.includes("--force");
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);

  for (const version of [manifest.en, manifest.he]) {
    if (only && version !== manifest[only as "en" | "he"]) continue;
    const existing = (await repo.getBookById(version.id)) ?? (await repo.getBookBySlug(version.slug));
    if (existing && !force) throw new Error(`${existing.slug} exists; pass --force to replace it`);
    if (existing) {
      await repo.deleteBook(existing.id);
      // The pictures stay in the English folder (they are the source); the old clips and copies go.
      for (const file of await media.list(bookMediaPrefix(existing.id))) {
        if (version === manifest.he || path.posix.basename(file).startsWith("librivox-")) await media.delete(file);
      }
    }
  }

  // Pictures, shared by both versions.
  const enDir = media.resolve(bookMediaPrefix(manifest.en.id));
  const find = (name: (ext: string) => string) =>
    ["webp", "jpg"].map(name).find((file) => existsSync(path.join(enDir, file)));
  const pictures = manifest.pages.map((_, i) => find((ext) => pageFile(i, ext)));
  const cover = find((ext) => `cover.${ext}`);
  const missing = pictures.filter((p) => !p).length;
  if (missing > 0) console.warn(`warning: ${missing} pages have no picture in ${enDir}`);

  const credits = {
    originalTitle: manifest.en.title,
    translator: manifest.translator,
    publisher: "LibriVox",
    publisherUrl: manifest.audio.project,
    attributionLine: `Audio: LibriVox recording read by ${manifest.audio.reader} (public domain). Text: ${manifest.textSource} (public domain). Illustrations made with AI.`,
  };
  const shared = {
    author: manifest.author,
    illustrator: "אויר בעזרת בינה מלאכותית",
    license: "Public domain (text and recording)",
    source: manifest.audio.project,
    ageGroup: manifest.ageGroup,
    status: "draft" as const,
    ownerId: SYSTEM_OWNER_ID,
    categories: manifest.categories,
    themes: manifest.themes,
    origin: "import" as const,
    viewCount: 0,
  };

  if (!only || only === "en") {
    const cache = path.join(root, "media", "tmp", "librivox");
    const audioFile = path.join(cache, path.basename(new URL(manifest.audio.url).pathname));
    await download(manifest.audio.url, audioFile);
    const words = JSON.parse(
      readFileSync(path.join(path.dirname(manifestPath), manifest.audio.words), "utf8"),
    ) as WhisperWord[];
    const story = manifest.pages.map((p) => p.en).join("\n");
    const timings = timeStory(storyWords(words, story), story);
    const clips = pageClips(manifest, timings, audioDuration(audioFile), detectSilences(audioFile));

    const pages: Page[] = [];
    for (const [i, clip] of clips.entries()) {
      const bytes = ffmpeg([
        "-ss", clip.start.toFixed(3), "-to", clip.end.toFixed(3), "-i", audioFile,
        "-ac", "1", "-b:a", "96k", "-af", `afade=t=in:d=0.04,afade=t=out:st=${(clip.end - clip.start - 0.06).toFixed(3)}:d=0.06`, "-f", "mp3", "-",
      ]);
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
      const audio = bookMediaPath(manifest.en.id, `librivox-${String(i + 1).padStart(2, "0")}-${hash}.mp3`);
      await media.put(audio, bytes, "audio/mpeg");
      const page = manifest.pages[i];
      pages.push({
        index: i,
        text: page.en,
        image: pictures[i] && bookMediaPath(manifest.en.id, pictures[i]),
        imageAlt: page.altEn,
        audio,
        audioSource: "recorded",
        wordTimings: clip.timings,
      });
      const t = clip.timings;
      console.log(
        `page ${i + 1}: ${clip.start.toFixed(2)}-${clip.end.toFixed(2)}s  "${t[0].word} ... ${t[t.length - 1].word}"`,
      );
    }
    const book = await repo.createBook({
      ...shared,
      id: manifest.en.id,
      slug: manifest.en.slug,
      title: manifest.en.title,
      summary: manifest.en.summary,
      coverImage: cover ? bookMediaPath(manifest.en.id, cover) : "",
      tags: [],
      discussionQuestions: [],
      language: "en",
      credits,
      pages,
    });
    console.log(`created ${book.slug} (en): ${book.pages.length} pages`);
  }

  if (!only || only === "he") {
    const heId = manifest.he.id;
    const copy = async (file: string | undefined) => {
      if (!file) return undefined;
      const object = await media.get(bookMediaPath(manifest.en.id, file));
      if (!object) return undefined;
      return (await media.put(bookMediaPath(heId, file), object.bytes, object.contentType)).path;
    };
    const pages: Page[] = [];
    for (const [i, page] of manifest.pages.entries()) {
      pages.push({ index: i, text: page.he, originalText: page.en, image: await copy(pictures[i]), imageAlt: page.altHe });
    }
    const book = await repo.createBook({
      ...shared,
      id: heId,
      slug: manifest.he.slug,
      title: manifest.he.title,
      summary: manifest.he.summary,
      coverImage: (await copy(cover)) ?? "",
      tags: manifest.he.tags,
      discussionQuestions: manifest.he.discussionQuestions,
      language: "he",
      originalLanguage: "en",
      credits: {
        ...credits,
        translator: "Dov Bar",
        adaptation: "Translation into Hebrew by Dov Bar, narrated with a synthetic voice",
      },
      pages,
    });
    console.log(`created ${book.slug} (he): ${book.pages.length} pages; narrate with: npx tsx scripts/narrate.ts ${book.slug}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
