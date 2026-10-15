/**
 * Attaches a clip made in Google Flow to a page, the same way scripts/animate.ts does
 * (media file "animation-NN-<hash>.mp4", Page.video / videoImageHash / videoSource "ai").
 *
 *   npx tsx .claude/skills/ai-picture-book/scripts/attach-clip.ts <slug> <page-number> <clip.mp4>
 *
 * Run from the project root. The audio track is removed first with ffmpeg (the reader's
 * clips are silent loops). Replaces an earlier clip on that page.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { imageHash } from "../../../../src/lib/animation/pipeline";
import { LocalRepository } from "../../../../src/lib/repo/local";

async function main(): Promise<void> {
  const [slug, pageArg, clipPath] = process.argv.slice(2);
  if (!slug || !pageArg || !clipPath) throw new Error("usage: attach-clip.ts <slug> <page-number> <clip.mp4>");
  const index = Number(pageArg) - 1;

  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const book = await repo.getBookBySlug(slug);
  if (!book) throw new Error(`no book with slug ${slug}`);
  const page = book.pages[index];
  if (!page?.image) throw new Error(`page ${pageArg} has no picture`);

  const tmp = mkdtempSync(path.join(tmpdir(), "clip-"));
  const silent = path.join(tmp, "silent.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clipPath, "-an", "-c:v", "copy", "-movflags", "+faststart", silent]);
  const bytes = readFileSync(silent);
  rmSync(tmp, { recursive: true, force: true });

  const name = `animation-${String(index + 1).padStart(2, "0")}-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.mp4`;
  const videoPath = `books/${book.id}/${name}`;
  writeFileSync(path.join(root, "media", videoPath), bytes);

  const hash = imageHash(readFileSync(path.join(root, "media", page.image)));
  const pages = book.pages.map((p) =>
    p.index === index ? { ...p, video: videoPath, videoImageHash: hash, videoSource: "ai" as const } : p,
  );
  await repo.replacePages(book.id, pages);
  console.log(`page ${pageArg} of ${slug} -> ${videoPath} (${bytes.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
