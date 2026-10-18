/**
 * Narration made with Gemini TTS in Google AI Studio (see aistudio-tts-driver.js).
 *
 *   npx tsx .claude/skills/ai-picture-book/scripts/attach-narration.ts <slug> --prepare <folder> [--pages 1,3]
 *       writes <folder>/narration-<slug>.json: [{page, text}] with the vocalized text of each page
 *   npx tsx .claude/skills/ai-picture-book/scripts/attach-narration.ts <slug> <folder> [--pages 1,3]
 *       attaches <folder>/<slug>-pNN.wav to page NN as mp3 (ffmpeg), audioSource "recorded", no timings yet
 *
 * Run from the project root. Time the words afterwards (local speech recognition, no cost):
 *   STT_PROVIDER=whisper STT_PYTHON="py -3.12" npx tsx scripts/align-recordings.ts --book <slug>
 * A page narrated this way is a "recorded" page: scripts/narrate.ts does not replace it unless forced.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { countWords } from "../../../../src/lib/hebrew";
import { narrationText } from "../../../../src/lib/narration/pipeline";
import { LocalRepository } from "../../../../src/lib/repo/local";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prepare = args.includes("--prepare");
  const pagesIdx = args.indexOf("--pages");
  const only = pagesIdx >= 0 ? (args[pagesIdx + 1] ?? "").split(",").map(Number) : undefined;
  const rest = args.filter((a, i) => a !== "--prepare" && a !== "--pages" && !(pagesIdx >= 0 && i === pagesIdx + 1));
  const [slug, folder] = rest;
  if (!slug || !folder) throw new Error("usage: attach-narration.ts <slug> [--prepare] <folder> [--pages 1,3]");

  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const book = await repo.getBookBySlug(slug);
  if (!book) throw new Error(`no book with slug ${slug}`);
  const wanted = (n: number) => !only || only.includes(n);

  if (prepare) {
    mkdirSync(folder, { recursive: true });
    const items = book.pages
      .filter((p) => countWords(p.text) > 0 && wanted(p.index + 1))
      .map((p) => ({ page: p.index + 1, text: narrationText(p) }));
    const file = path.join(folder, `narration-${slug}.json`);
    writeFileSync(file, JSON.stringify(items, null, 1), "utf8");
    console.log(`${items.length} pages -> ${file}`);
    return;
  }

  const attached = new Map<number, string>();
  for (const page of book.pages) {
    const n = page.index + 1;
    const wav = path.join(folder, `${slug}-p${String(n).padStart(2, "0")}.wav`);
    if (!wanted(n) || !existsSync(wav)) continue;
    const tmp = mkdtempSync(path.join(tmpdir(), "narr-"));
    const mp3 = path.join(tmp, "a.mp3");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", mp3]);
    const bytes = readFileSync(mp3);
    rmSync(tmp, { recursive: true, force: true });
    const name = `narration-${String(n).padStart(2, "0")}-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.mp3`;
    const audioPath = `books/${book.id}/${name}`;
    mkdirSync(path.join(root, "media", "books", book.id), { recursive: true });
    writeFileSync(path.join(root, "media", audioPath), bytes);
    attached.set(page.index, audioPath);
    console.log(`page ${n} -> ${audioPath} (${bytes.byteLength} bytes)`);
  }
  if (attached.size === 0) throw new Error(`no ${slug}-pNN.wav files in ${folder}`);

  const pages = book.pages.map((p) => {
    const audio = attached.get(p.index);
    if (!audio) return p;
    const { wordTimings: _drop, ...keep } = p;
    return { ...keep, audio, audioSource: "recorded" as const };
  });
  await repo.replacePages(book.id, pages);
  console.log(`attached ${attached.size} pages; now run scripts/align-recordings.ts --book ${slug}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
