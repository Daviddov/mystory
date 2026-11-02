/**
 * Adds a version in another language to a book and narrates it, in the local
 * data directory (default ./data). The first other language goes into
 * Book.translation / Page.translation, further ones into Book.extraTranslations /
 * Page.extraTranslations (see withBookVersion in src/lib/types.ts).
 *
 *   npx tsx scripts/add-translation.ts <file.json> [--slug <slug>] [--narrate] [--force]
 *     --slug      the book; default the file name up to the first dot
 *     --narrate   narrate every translated page that has no narration yet
 *     --force     narrate again even when a page already has narration
 *     --voice V   TTS voice (default: the book's voice, else the provider's default)
 *     --style S   narration style preset (default "playful-rhymes")
 *     --prepare D write D/narration-<slug>-<lang>.json ([{page, text}]) for the AI Studio book driver
 *                 (.claude/skills/ai-picture-book: queue "<slug>-<lang>", then split-book-audio.ts --translation)
 *     --audio D   attach D/<slug>-pNN.wav as each page's narration (mp3, audioSource "recorded",
 *                 word timings estimated from the pauses, as the reader does)
 *
 * The file (see scripts/originals/translations/):
 *   { "language": "en", "title": "...", "summary": "...", "pages": ["page 1 text", ...] }
 * with exactly one text per page of the book. A page whose text did not change
 * keeps its narration; a changed text drops it.
 *
 * Providers follow the same env vars as the site (TTS_PROVIDER, ...), read from
 * the shell and then from .env.local and .env. Only the local JSON repository
 * is supported; publish with supabase/mirror-local.ts.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { mockTtsProvider } from "../src/lib/ai/mock";
import type { TtsProvider } from "../src/lib/ai/types";
import { withBookLock } from "../src/lib/book-lock";
import { splitWords } from "../src/lib/hebrew";
import { LocalMediaStore } from "../src/lib/media/local";
import { bookMediaPath, extensionForContentType } from "../src/lib/media/url";
import { isAllowedNarrationVoice } from "../src/lib/narration/voices";
import { detectSpeech, estimateWordTimings } from "../src/lib/reader/estimate-timings";
import { LocalRepository } from "../src/lib/repo/local";
import {
  BookLanguageSchema,
  pageVersion,
  withBookVersion,
  withPageVersion,
  type BookLanguage,
  type Page,
  type PageTranslation,
} from "../src/lib/types";

const TranslationFileSchema = z.object({
  language: BookLanguageSchema,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  pages: z.array(z.string()),
});

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), file));
    } catch {
      // No such file.
    }
  }
}

async function pickTts(): Promise<TtsProvider> {
  const name = env("TTS_PROVIDER")?.toLowerCase();
  if (name === undefined || name === "mock") return mockTtsProvider;
  return (await import("../src/lib/ai/providers/tts")).createTtsProvider();
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const args = process.argv.slice(2);
  const file = args.find(
    (arg, i) => !arg.startsWith("--") && !["--slug", "--voice", "--style", "--prepare", "--audio"].includes(args[i - 1]),
  );
  if (!file) {
    console.error("usage: tsx scripts/add-translation.ts <file.json> [--slug <slug>] [--narrate] [--force] [--voice V] [--style S]");
    process.exit(2);
  }
  const input = TranslationFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const slug = option(args, "--slug") ?? path.basename(file).split(".")[0];
  const narrate = args.includes("--narrate");
  const force = args.includes("--force");
  const style = option(args, "--style") ?? "playful-rhymes";

  const dataDirOverride = env("DATA_DIR");
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);

  const book = await repo.getBookBySlug(slug);
  if (!book) throw new Error(`no book with slug "${slug}"`);
  if (input.language === (book.language ?? "he")) throw new Error(`the book is already in "${input.language}"`);
  if (input.pages.length !== book.pages.length) {
    throw new Error(`the file has ${input.pages.length} page texts, the book has ${book.pages.length} pages`);
  }

  // 1. Text.
  const dropped: string[] = [];
  await withBookLock(book.id, async () => {
    const fresh = (await repo.getBookById(book.id)) ?? book;
    const old = fresh.translation?.language === input.language ? fresh.translation : fresh.extraTranslations?.find((v) => v.language === input.language);
    const versions = withBookVersion(fresh, {
      ...old,
      language: input.language,
      title: input.title,
      ...(input.summary ? { summary: input.summary } : {}),
    });
    const pages: Page[] = fresh.pages.map((page, i) => {
      const text = cleanText(input.pages[i]);
      const before = pageVersion(versions, page, input.language);
      if (!text) {
        if (before?.audio) dropped.push(before.audio);
        return withPageVersion(versions, page, input.language, undefined);
      }
      if (before && before.text === text) return page;
      if (before?.audio) dropped.push(before.audio);
      return withPageVersion(versions, page, input.language, { text });
    });
    await repo.replacePages(book.id, pages);
    await repo.updateBook(book.id, versions);
  });
  for (const audio of dropped) await media.delete(audio).catch(() => undefined);
  console.log(`${slug}: ${input.language} text stored (${dropped.length} old narration file(s) dropped)`);

  const prepareDir = option(args, "--prepare");
  if (prepareDir) {
    mkdirSync(prepareDir, { recursive: true });
    const items = input.pages.map((text, i) => ({ page: i + 1, text: cleanText(text) })).filter((item) => item.text);
    const out = path.join(prepareDir, `narration-${slug}-${input.language}.json`);
    writeFileSync(out, JSON.stringify(items, null, 1), "utf8");
    console.log(`${items.length} pages -> ${out}`);
  }

  const audioDir = option(args, "--audio");
  if (audioDir) await attachAudio(repo, media, book.id, slug, input.language, audioDir);
  if (!narrate) return;

  // 2. Narration.
  const tts = await pickTts();
  const heroVoice = book.hero?.narrationVoice;
  const voice = option(args, "--voice") ?? (heroVoice && isAllowedNarrationVoice(heroVoice) ? heroVoice : undefined);
  console.log(`tts:   ${tts.name}${tts.isMock ? ' (mock: SILENT demo audio, stored as audioSource "mock")' : ""}${voice ? `, voice ${voice}` : ""}, style ${style}`);
  let failed = 0;
  for (let i = 0; i < book.pages.length; i++) {
    const latest = await repo.getBookById(book.id);
    const current = latest?.pages[i];
    const translation = latest && current ? pageVersion(latest, current, input.language) : undefined;
    if (!translation?.text) continue;
    if (translation.audio && !force && !(translation.audioSource === "mock" && !tts.isMock)) {
      console.log(`  page ${i + 1}: kept`);
      continue;
    }
    try {
      const speech = await tts.synthesize(translation.text, { ...(voice ? { voice } : {}), style });
      const words = splitWords(translation.text);
      if (speech.wordTimings.length !== words.length) {
        throw new Error(`${speech.wordTimings.length} word timings for ${words.length} words`);
      }
      const hash = createHash("sha256").update(speech.audio).digest("hex").slice(0, 10);
      const name = `narration-${input.language}-${String(i + 1).padStart(2, "0")}-${hash}.${extensionForContentType(speech.contentType)}`;
      const audioPath = bookMediaPath(book.id, name);
      await media.put(audioPath, speech.audio, speech.contentType);
      const next: PageTranslation = {
        text: translation.text,
        audio: audioPath,
        wordTimings: speech.wordTimings.map((timing, w) => ({ word: words[w], start: timing.start, end: Math.max(timing.start, timing.end) })),
        audioSource: speech.isMock ? "mock" : "tts",
      };
      await withBookLock(book.id, async () => {
        const fresh = await repo.getBookById(book.id);
        if (!fresh || pageVersion(fresh, fresh.pages[i], input.language)?.text !== translation.text) {
          throw new Error("the page changed meanwhile");
        }
        await repo.replacePages(
          book.id,
          fresh.pages.map((page, p) => (p === i ? withPageVersion(fresh, page, input.language, next) : page)),
        );
      });
      if (translation.audio && translation.audio !== audioPath) await media.delete(translation.audio).catch(() => undefined);
      console.log(`  page ${i + 1}: ${audioPath} (${speech.durationSeconds.toFixed(1)}s)`);
    } catch (err) {
      failed++;
      console.log(`  page ${i + 1}: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} page(s) failed`);
    process.exit(1);
  }
}

/** Attaches <dir>/<slug>-pNN.wav files (one Gemini read of the book, cut by split-book-audio.ts --translation). */
async function attachAudio(
  repo: LocalRepository,
  media: LocalMediaStore,
  bookId: string,
  slug: string,
  language: BookLanguage,
  dir: string,
): Promise<void> {
  const RATE = 16000;
  const attached = new Map<number, PageTranslation>();
  const book = await repo.getBookById(bookId);
  if (!book) throw new Error(`book ${bookId} disappeared`);
  for (const page of book.pages) {
    const n = String(page.index + 1).padStart(2, "0");
    const wav = path.join(dir, `${slug}-p${n}.wav`);
    const text = pageVersion(book, page, language)?.text;
    if (!text || !existsSync(wav)) continue;
    const mp3 = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", "-f", "mp3", "-"], {
      maxBuffer: 1 << 28,
    });
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], {
      maxBuffer: 1 << 28,
    });
    const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    const wordTimings = estimateWordTimings(text, detectSpeech(samples, RATE), samples.length / RATE);
    const hash = createHash("sha256").update(mp3).digest("hex").slice(0, 10);
    const audioPath = bookMediaPath(bookId, `narration-${language}-${n}-${hash}.mp3`);
    await media.put(audioPath, new Uint8Array(mp3), "audio/mpeg");
    attached.set(page.index, { text, audio: audioPath, wordTimings, audioSource: "recorded" });
    console.log(`  page ${page.index + 1}: ${audioPath} (${(samples.length / RATE).toFixed(1)}s)`);
  }
  if (attached.size === 0) throw new Error(`no ${slug}-pNN.wav files in ${dir}`);
  const old: string[] = [];
  await withBookLock(bookId, async () => {
    const fresh = await repo.getBookById(bookId);
    if (!fresh) throw new Error(`book ${bookId} disappeared`);
    const pages = fresh.pages.map((page) => {
      const next = attached.get(page.index);
      const before = pageVersion(fresh, page, language);
      if (!next || before?.text !== next.text) return page;
      if (before.audio && before.audio !== next.audio) old.push(before.audio);
      return withPageVersion(fresh, page, language, next);
    });
    await repo.replacePages(bookId, pages);
  });
  for (const audio of old) await media.delete(audio).catch(() => undefined);
  console.log(`attached ${attached.size} page(s)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
