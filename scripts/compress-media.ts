/**
 * Recompresses the illustrations in the local media folder for the web.
 *
 *   tsx scripts/compress-media.ts [--dry-run] [--max=1600] [--quality=80]
 *
 * Every PNG/JPEG under <DATA_DIR>/media becomes a WebP of at most --max pixels
 * on its long side. The original moves, untouched, to
 * <DATA_DIR>/originals/media/<same path> (kept for print and future use; it is
 * not served and not deployed). Every JSON file under <DATA_DIR> that names the
 * old media path (as "books/x/page-01.jpg" or "/media/books/x/page-01.jpg") is
 * rewritten to the new one.
 *
 * Safe to run again: WebP files are skipped, and so is any image whose WebP
 * would not be at least 10% smaller (it stays as it is). GIF and SVG are left
 * alone. Only the local data directory is supported.
 *
 * New illustrations are converted when they are saved (src/lib/media/optimize.ts,
 * same settings); this script is for files stored before that.
 */
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodeWebp, WEBP_MAX_RATIO, WEBP_MAX_SIDE, WEBP_QUALITY } from "../src/lib/media/optimize";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const numberArg = (name: string, fallback: number): number => {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value;
};
const maxSide = numberArg("max", WEBP_MAX_SIDE);
const quality = numberArg("quality", WEBP_QUALITY);

const dataDir = path.resolve(process.env.DATA_DIR || "data");
const mediaDir = path.join(dataDir, "media");
const originalsDir = path.join(dataDir, "originals", "media");
const IMAGE = /\.(png|jpe?g)$/i;
const CONCURRENCY = 6;

async function walk(dir: string, match: (file: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, match)));
    else if (match(entry.name)) out.push(full);
  }
  return out;
}

const toMediaPath = (file: string): string => path.relative(mediaDir, file).split(path.sep).join("/");
const exists = (file: string): Promise<boolean> => stat(file).then(() => true, () => false);

interface Result {
  from: string;
  to: string;
  before: number;
  after: number;
}

async function compress(file: string): Promise<Result | null> {
  const target = file.replace(IMAGE, ".webp");
  if (await exists(target)) {
    console.warn(`skip (a .webp of that name exists): ${toMediaPath(file)}`);
    return null;
  }
  const input = await readFile(file);
  const output = await encodeWebp(input, { maxSide, quality });
  if (output.length > input.length * WEBP_MAX_RATIO) return null;
  if (!dryRun) {
    const archived = path.join(originalsDir, path.relative(mediaDir, file));
    await mkdir(path.dirname(archived), { recursive: true });
    await writeFile(target, output);
    await rename(file, archived);
  }
  return { from: toMediaPath(file), to: toMediaPath(target), before: input.length, after: output.length };
}

/** Replaces every string value equal to an old media path (bare or as "/media/<path>"). */
function rewrite(value: unknown, renames: Map<string, string>): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const bare = renames.get(value);
    if (bare) return { value: bare, changed: true };
    if (value.startsWith("/media/")) {
      const next = renames.get(value.slice("/media/".length));
      if (next) return { value: `/media/${next}`, changed: true };
    }
    return { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const r = rewrite(item, renames);
      changed ||= r.changed;
      return r.value;
    });
    return { value: items, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      const r = rewrite(item, renames);
      changed ||= r.changed;
      return [key, r.value] as const;
    });
    return { value: Object.fromEntries(entries), changed };
  }
  return { value, changed: false };
}

async function main(): Promise<void> {
  const files = await walk(mediaDir, (name) => IMAGE.test(name));
  console.log(`${files.length} PNG/JPEG files under ${mediaDir}${dryRun ? " (dry run)" : ""}`);

  const results: Result[] = [];
  let failed = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const file = files[next++];
      try {
        const result = await compress(file);
        if (result) results.push(result);
      } catch (err) {
        failed++;
        console.error(`failed: ${toMediaPath(file)}: ${err instanceof Error ? err.message : err}`);
      }
      const done = results.length;
      if (done > 0 && done % 500 === 0) console.log(`  ${done} converted…`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const renames = new Map(results.map((r) => [r.from, r.to]));
  let jsonChanged = 0;
  if (renames.size > 0) {
    const jsonFiles = await walk(dataDir, (name) => name.endsWith(".json"));
    for (const file of jsonFiles) {
      if (file.startsWith(originalsDir)) continue;
      const text = await readFile(file, "utf8");
      const r = rewrite(JSON.parse(text.replace(/^﻿/, "")), renames);
      if (!r.changed) continue;
      jsonChanged++;
      if (!dryRun) await writeFile(file, `${JSON.stringify(r.value, null, 2)}\n`);
    }
  }

  const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
  const before = results.reduce((sum, r) => sum + r.before, 0);
  const after = results.reduce((sum, r) => sum + r.after, 0);
  console.log(
    `${results.length} converted (${mb(before)} MB -> ${mb(after)} MB), ` +
      `${files.length - results.length - failed} left as they were, ${failed} failed, ` +
      `${jsonChanged} JSON files updated.`,
  );
  if (!dryRun && results.length > 0) console.log(`Originals: ${originalsDir}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
