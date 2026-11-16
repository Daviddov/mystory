/**
 * Turns narrated books into material for the outside channels (see docs/organic-marketing-plan.md):
 *
 *   exports/<slug>/video.mp4       16:9 story video for YouTube: picture on the left, vocalized text on the
 *                                  right, switching with the narration; title card, end card, soundtrack
 *   exports/<slug>/short.mp4       9:16 clip (up to ~55 s) for Shorts, Reels and TikTok: the opening pages
 *                                  and "the full story on the site"
 *   exports/<slug>/podcast.mp3     the whole narration as one episode, soundtrack underneath, -16 LUFS
 *   exports/<slug>/youtube.txt     title, description with chapters and credits, tags
 *   exports/<slug>/thumbnail.jpg   1280x720 YouTube thumbnail
 *   exports/<slug>/episode.jpg     1400x1400 podcast episode image
 *
 * Usage:
 *   npm run export:media -- <slug|id>... [--video] [--short] [--podcast] [--force] [--site https://...]
 *       Without --video/--short/--podcast all three are made. Reads local data (data/).
 *   npm run export:media -- <slug|id>... --publish <bedtime|parasha> [--at 2026-11-20T17:00] [--every 2]
 *       Also uploads each episode to the media store (Supabase when its env vars are set:
 *       npx tsx --env-file=.env.supabase scripts/export-media.ts ...) and adds it to the show's feed,
 *       /podcast/<show>/feed.xml. --at sets the release time of the first book, --every N spaces the
 *       next books N days apart.
 *   npm run export:media -- <slug|id>... --compilation <folder> --title "<title>"
 *       One long video of the books in a row (a holiday or bedtime collection), with a chapter per book.
 *   npm run export:media -- --show-cover <bedtime|parasha> <slug|id>...
 *       Makes the 3000x3000 show cover from up to four book covers and uploads it.
 *
 * Needs ffmpeg and ffprobe on PATH. Only published books, all pages narrated (--force skips the checks).
 * Hebrew text is drawn with sharp (SVG), which shapes nikud correctly; ffmpeg's drawtext does not.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { dataDir, isSupabaseConfigured, siteUrl } from "../src/lib/config";
import { creditPeople, creditStatements } from "../src/lib/credits";
import { stripNikud } from "../src/lib/hebrew";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import type { MediaStore } from "../src/lib/media/types";
import {
  isPodcastShow,
  PODCAST_SHOWS,
  PodcastManifestSchema,
  podcastFolder,
  podcastManifestPath,
  upsertEpisode,
  type PodcastManifest,
  type PodcastShowId,
} from "../src/lib/podcast";
import { woffToSfnt } from "../src/lib/pdf/woff";
import { LocalRepository } from "../src/lib/repo/local";
import type { BookWithPages } from "../src/lib/types";
import { buildCaptionCards, chapterTimestamp, type CaptionCard } from "../src/lib/video-captions";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
function option(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const VALUE_OPTIONS = ["--compilation", "--title", "--site", "--publish", "--at", "--every", "--show-cover", "--music-volume", "--out"];
const refs = argv.filter((a, i) => !a.startsWith("--") && !VALUE_OPTIONS.includes(argv[i - 1] ?? ""));
const showCover = option("--show-cover");
const publishShow = option("--publish");
const force = flags.has("--force");
const anyKind = flags.has("--video") || flags.has("--short") || flags.has("--podcast");
const want = {
  video: !anyKind || flags.has("--video"),
  short: !anyKind || flags.has("--short"),
  podcast: !anyKind || flags.has("--podcast") || !!publishShow,
};
/** Public site the exports link to. A local run has no production URL, so it falls back to the live site. */
const PRODUCTION_SITE = "https://mystory-alpha.vercel.app";
const localSite = /localhost|127\.0\.0\.1/.test(siteUrl()) ? PRODUCTION_SITE : siteUrl();
const SITE = (option("--site") ?? localSite).replace(/\/+$/, "");
const MUSIC_VOLUME = Number(option("--music-volume") ?? "0.12");
const OUT_ROOT = path.resolve(option("--out") ?? "exports");

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

const FPS = 30;
/** The reader's story font on the site, so the videos look like the books. Loaded by loadSiteFonts(). */
const FONT = "Frank Ruhl Libre, Arial, sans-serif";
const BODY_WEIGHT = 500;

/**
 * Makes the site's story font visible to sharp. The font ships as WOFF
 * (@fontsource); sharp's text engine (fontconfig) reads TTF, so the WOFF files
 * are unpacked once into node_modules/.cache and fontconfig is pointed at that
 * folder plus the system fonts (for any character the subsets lack).
 */
function loadSiteFonts(): void {
  const dir = path.join(process.cwd(), "node_modules", ".cache", "mystory-video-fonts").replace(/\\/g, "/");
  mkdirSync(dir, { recursive: true });
  for (const subset of ["hebrew", "latin"]) {
    for (const weight of [500, 700]) {
      const name = `frank-ruhl-libre-${subset}-${weight}-normal`;
      const ttf = path.join(dir, `${name}.ttf`);
      if (existsSync(ttf)) continue;
      const woff = readFileSync(path.join(process.cwd(), "node_modules", "@fontsource", "frank-ruhl-libre", "files", `${name}.woff`));
      writeFileSync(ttf, woffToSfnt(woff));
    }
  }
  const systemFonts = process.platform === "win32" ? "<dir>C:/Windows/Fonts</dir>" : "<dir>/usr/share/fonts</dir>";
  const conf = path.join(dir, "fonts.conf");
  writeFileSync(
    conf,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${dir}</dir>${systemFonts}<cachedir>${dir}/fc-cache</cachedir></fontconfig>`,
  );
  process.env.FONTCONFIG_FILE = conf;
}
const CREAM = "#FFF8EC";
const INK = "#2B2118";
const ACCENT = "#B5651D";
const PAGE_PAUSE = 0.7; // seconds of quiet after each page

interface Layout {
  width: number;
  height: number;
  /** Picture box. */
  pic: { x: number; y: number; w: number; h: number };
  /** Text panel. */
  panel: { x: number; y: number; w: number; h: number };
  fontSize: number;
  lineHeight: number;
  maxChars: number;
  maxRows: number;
}

const LANDSCAPE: Layout = {
  width: 1920,
  height: 1080,
  pic: { x: 0, y: 0, w: 960, h: 1080 },
  panel: { x: 960, y: 120, w: 960, h: 840 },
  fontSize: 64,
  lineHeight: 108,
  maxChars: 28,
  maxRows: 7,
};

const PORTRAIT: Layout = {
  width: 1080,
  height: 1920,
  pic: { x: 0, y: 0, w: 1080, h: 1215 },
  panel: { x: 0, y: 1215, w: 1080, h: 705 },
  fontSize: 62,
  lineHeight: 102,
  maxChars: 32,
  maxRows: 6,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[]): string {
  const result = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${cmd} failed (${result.status}):\n${(result.stderr || "").split("\n").slice(-25).join("\n")}`);
  }
  return result.stdout;
}

function ffmpeg(args: string[]): void {
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

function duration(file: string): number {
  const out = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number(out.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`no duration for ${file}`);
  return seconds;
}

function mediaFile(mediaPath: string): string {
  const file = mediaPath.startsWith("/")
    ? path.join(process.cwd(), "public", mediaPath)
    : path.join(dataDir(), "media", ...mediaPath.split("/"));
  if (!existsSync(file)) throw new Error(`missing media file ${file}`);
  return file;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** SVG <text> rows centred on (cx, cy). */
function textRows(rows: string[], cx: number, cy: number, size: number, lineHeight: number, fill = INK, weight = BODY_WEIGHT): string {
  const top = cy - ((rows.length - 1) * lineHeight) / 2;
  return rows
    .map(
      (row, i) =>
        `<text x="${cx}" y="${top + i * lineHeight}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" dominant-baseline="middle" direction="rtl">${esc(row)}</text>`,
    )
    .join("");
}

function svg(width: number, height: number, body: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
}

/** Simple word wrap for titles (plain text). */
function wrapPlain(text: string, maxChars: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (row && stripNikud(row).length + 1 + stripNikud(word).length > maxChars) {
      rows.push(row);
      row = word;
    } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows;
}

/** Where a picture lands inside the layout's picture box ("contain", centred), with even sizes for the encoder. */
async function pictureRect(file: string, layout: Layout): Promise<{ x: number; y: number; w: number; h: number }> {
  const { width = 1, height = 1 } = await sharp(file).metadata();
  const scale = Math.min(layout.pic.w / width, layout.pic.h / height);
  const w = Math.round((width * scale) / 2) * 2;
  const h = Math.round((height * scale) / 2) * 2;
  return { x: layout.pic.x + Math.round((layout.pic.w - w) / 2), y: layout.pic.y + Math.round((layout.pic.h - h) / 2), w, h };
}

/** A picture fitted inside a box on the cream background. */
async function pictureLayer(file: string, w: number, h: number): Promise<Buffer> {
  return sharp(file).resize(w, h, { fit: "contain", background: CREAM }).png().toBuffer();
}

async function frame(layout: Layout, picture: string | null, overlay: string, out: string): Promise<void> {
  const layers: { input: Buffer; left: number; top: number }[] = [];
  if (picture) layers.push({ input: await pictureLayer(picture, layout.pic.w, layout.pic.h), left: layout.pic.x, top: layout.pic.y });
  layers.push({ input: svg(layout.width, layout.height, overlay), left: 0, top: 0 });
  await sharp({ create: { width: layout.width, height: layout.height, channels: 4, background: CREAM } })
    .composite(layers)
    .png()
    .toFile(out);
}

function host(): string {
  try {
    return new URL(SITE).host.replace(/^www\./, "");
  } catch {
    return SITE;
  }
}

function bookLink(book: BookWithPages, source: string, medium: string): string {
  return `${SITE}/book/${encodeURIComponent(book.slug)}?utm_source=${source}&utm_medium=${medium}&utm_campaign=story`;
}

function plainTitle(book: BookWithPages): string {
  return stripNikud(book.title).trim();
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

interface Segment {
  file: string;
  seconds: number;
  /** Chapter title, for the YouTube description. */
  chapter?: string;
}

/**
 * Encodes one segment: full frames shown one after another for set times (the
 * subtitle cards, already drawn on the page picture), an optional looping clip
 * in the picture box, and the audio. Two video inputs at most, so memory stays
 * flat however many cards a page has.
 */
function encodeSegment(opts: {
  layout: Layout;
  frames: { file: string; seconds: number }[];
  /** Looping clip, stretched over the rectangle the page picture fills (it was made from that picture). */
  clip?: { file: string; x: number; y: number; w: number; h: number };
  audio?: string;
  seconds: number;
  out: string;
}): void {
  const { frames, clip, audio, seconds, out } = opts;
  const list = `${out}.frames.txt`;
  const quote = (file: string) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
  const entries = frames.flatMap((f) => [quote(f.file), `duration ${Math.max(f.seconds, 1 / FPS).toFixed(3)}`]);
  entries.push(quote(frames[frames.length - 1].file)); // the concat demuxer needs the last image twice
  writeFileSync(list, entries.join("\n"));

  const args: string[] = ["-f", "concat", "-safe", "0", "-i", list];
  let next = 1;
  let clipIndex = -1;
  if (clip) {
    args.push("-stream_loop", "-1", "-i", clip.file);
    clipIndex = next++;
  }
  if (audio) args.push("-i", audio);
  else args.push("-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=48000:cl=stereo");
  const audioIndex = next++;

  const filters: string[] = [`[0:v]fps=${FPS},format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=2[v0]`];
  let last = "v0";
  if (clip && clipIndex >= 0) {
    const { x, y, w, h } = clip;
    filters.push(`[${clipIndex}:v]scale=${w}:${h},setsar=1,fps=${FPS}[clip]`);
    filters.push(`[${last}][clip]overlay=x=${x}:y=${y}:shortest=1[vc]`);
    last = "vc";
  }
  filters.push(`[${last}]format=yuv420p[v]`);
  filters.push(`[${audioIndex}:a]aresample=48000,aformat=channel_layouts=stereo,apad[a]`);

  ffmpeg([
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    seconds.toFixed(3),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
    out,
  ]);
}

/** Joins segments and lays the soundtrack under the narration. */
function finishVideo(segments: Segment[], soundtrack: string | undefined, work: string, out: string): void {
  const list = path.join(work, `${path.basename(out)}.txt`);
  writeFileSync(list, segments.map((s) => `file '${s.file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(work, `joined-${path.basename(out)}`);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  const total = duration(joined);
  const fadeAt = Math.max(0, total - 2.5).toFixed(2);
  const args = ["-i", joined];
  let audioFilter: string;
  if (soundtrack) {
    args.push("-stream_loop", "-1", "-i", soundtrack);
    audioFilter =
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${MUSIC_VOLUME}[m];` +
      `[0:a][m]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${fadeAt}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  } else {
    audioFilter = `[0:a]afade=t=out:st=${fadeAt}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  }
  ffmpeg([...args, "-filter_complex", audioFilter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", out]);
}

async function titleCard(book: BookWithPages | string, layout: Layout, cover: string, out: string, subtitle: string): Promise<void> {
  const title = typeof book === "string" ? book : plainTitle(book);
  const landscape = layout.width > layout.height;
  const cx = layout.panel.x + layout.panel.w / 2;
  const titleRows = wrapPlain(title, landscape ? 16 : 18);
  const size = landscape ? 86 : 80;
  const cy = layout.panel.y + layout.panel.h / 2 - (landscape ? 40 : 30);
  const body =
    textRows(titleRows, cx, cy, size, size * 1.3, INK, 700) +
    textRows([subtitle], cx, cy + (titleRows.length * size * 1.3) / 2 + 70, landscape ? 44 : 42, 60, ACCENT) +
    textRows(["הסיפור שלי"], cx, layout.height - 60, 34, 40, ACCENT);
  await frame(layout, cover, body, out);
}

async function endCard(layout: Layout, lines: string[], out: string): Promise<void> {
  const cx = layout.width / 2;
  const cy = layout.height / 2;
  const body =
    textRows(lines, cx, cy - 80, layout.width > layout.height ? 60 : 58, 92, INK, 700) +
    textRows([host()], cx, cy + 120, 76, 80, ACCENT, 700) +
    textRows(["הסיפור שלי · סיפורים מוקראים לילדים עם ניקוד"], cx, cy + 230, 36, 40, INK);
  await frame(layout, null, body, out);
}

interface PageAudio {
  file: string;
  seconds: number;
}

async function pageSegment(
  book: BookWithPages,
  pageIndex: number,
  audio: PageAudio,
  layout: Layout,
  work: string,
  tag: string,
  limit?: number,
): Promise<Segment> {
  const page = book.pages[pageIndex];
  const picture = page.image ? mediaFile(page.image) : null;
  const header = layout.width > layout.height
    ? textRows([plainTitle(book)], layout.panel.x + layout.panel.w / 2, 70, 34, 40, ACCENT)
    : "";

  const cards: CaptionCard[] = buildCaptionCards({
    text: page.textNikud?.trim() ? page.textNikud : page.text,
    duration: audio.seconds,
    timings: page.wordTimings,
    maxChars: layout.maxChars,
    maxRows: layout.maxRows,
  });
  let seconds = audio.seconds + PAGE_PAUSE;
  if (limit !== undefined && seconds > limit) {
    // Cut at the last card change that fits, so the clip never stops mid-card.
    const cut = cards.filter((c) => c.start > 0 && c.start <= limit).map((c) => c.start).pop();
    seconds = cut ?? limit;
  }
  const shown = cards.filter((c) => c.start < seconds);
  const cx = layout.panel.x + layout.panel.w / 2;
  const cy = layout.panel.y + layout.panel.h / 2;
  const frames = await Promise.all(
    (shown.length > 0 ? shown : [{ rows: [], start: 0, end: seconds }]).map(async (card, i, all) => {
      const file = path.join(work, `${tag}-p${pageIndex}-c${i}.png`);
      await frame(layout, picture, header + textRows(card.rows, cx, cy, layout.fontSize, layout.lineHeight), file);
      const end = i === all.length - 1 ? seconds : Math.min(card.end, seconds);
      return { file, seconds: end - card.start };
    }),
  );
  const out = path.join(work, `${tag}-p${pageIndex}.mp4`);
  encodeSegment({
    layout,
    frames,
    clip: page.video && picture ? { file: mediaFile(page.video), ...(await pictureRect(picture, layout)) } : undefined,
    audio: audio.file,
    seconds,
    out,
  });
  return { file: out, seconds, chapter: `עמוד ${pageIndex + 1}` };
}

async function stillSegment(layout: Layout, image: string, seconds: number, out: string): Promise<Segment> {
  encodeSegment({ layout, frames: [{ file: image, seconds }], seconds, out });
  return { file: out, seconds };
}

async function makeVideo(
  book: BookWithPages,
  audio: PageAudio[],
  cover: string,
  work: string,
  outDir: string,
  soundtrack?: string,
  /** For a compilation: write here, and leave out the thumbnail and the end card. */
  partOf?: { out: string },
) {
  const layout = LANDSCAPE;
  const titlePng = path.join(work, "v-title.png");
  await titleCard(book, layout, cover, titlePng, "סיפור מוקרא לילדים");
  if (!partOf) await sharp(titlePng).resize(1280, 720).jpeg({ quality: 88 }).toFile(path.join(outDir, "thumbnail.jpg"));
  const segments: Segment[] = [await stillSegment(layout, titlePng, 3.5, path.join(work, "v-title.mp4"))];
  segments[0].chapter = "פתיחה";
  for (let i = 0; i < book.pages.length; i++) {
    segments.push(await pageSegment(book, i, audio[i], layout, work, "v"));
    process.stdout.write(`  video page ${i + 1}/${book.pages.length}\r`);
  }
  if (!partOf) {
    const endPng = path.join(work, "v-end.png");
    await endCard(layout, ["הסיפור המלא, עם ניקוד ואיורים,", "מחכה לכם באתר"], endPng);
    segments.push(await stillSegment(layout, endPng, 5, path.join(work, "v-end.mp4")));
  }
  finishVideo(segments, soundtrack, work, partOf?.out ?? path.join(outDir, "video.mp4"));
  return segments;
}

/**
 * One long video of several books in a row (a bedtime or holiday collection):
 * a collection title card, each book with its own soundtrack, one end card,
 * and a YouTube chapter per book.
 */
async function makeCompilation(books: BookWithPages[], name: string, title: string): Promise<void> {
  const outDir = path.join(OUT_ROOT, name);
  const work = mkdtempSync(path.join(os.tmpdir(), `mystory-compilation-${name}-`));
  mkdirSync(outDir, { recursive: true });
  const layout = LANDSCAPE;

  // Up to four covers side by side for the title card and the thumbnail.
  const covers = books.slice(0, 4).map(coverFile);
  const cols = covers.length >= 2 ? 2 : 1;
  const rows = covers.length >= 3 ? 2 : 1;
  const cellW = Math.floor(layout.pic.w / cols);
  const cellH = Math.floor(layout.pic.h / rows);
  const grid = path.join(work, "covers.png");
  await sharp({ create: { width: layout.pic.w, height: layout.pic.h, channels: 3, background: CREAM } })
    .composite(
      await Promise.all(
        covers.map(async (file, i) => ({
          input: await sharp(file).resize(cellW, cellH, { fit: "cover" }).toBuffer(),
          left: (i % cols) * cellW,
          top: Math.floor(i / cols) * cellH,
        })),
      ),
    )
    .png()
    .toFile(grid);

  const titlePng = path.join(work, "title.png");
  await titleCard(title, layout, grid, titlePng, `${books.length} סיפורים מוקראים לילדים`);
  await sharp(titlePng).resize(1280, 720).jpeg({ quality: 88 }).toFile(path.join(outDir, "thumbnail.jpg"));
  const parts: Segment[] = [{ ...(await stillSegment(layout, titlePng, 4, path.join(work, "title.mp4"))), chapter: "פתיחה" }];

  for (const [i, book] of books.entries()) {
    console.log(`  ${i + 1}/${books.length} ${plainTitle(book)}`);
    const bookWork = mkdtempSync(path.join(work, "book-"));
    const audio = book.pages.map((p) => {
      const file = mediaFile(p.audio!);
      return { file, seconds: duration(file) };
    });
    const out = path.join(work, `book-${i}.mp4`);
    await makeVideo(book, audio, coverFile(book), bookWork, outDir, book.soundtrack ? mediaFile(book.soundtrack) : undefined, { out });
    parts.push({ file: out, seconds: duration(out), chapter: plainTitle(book) });
  }

  const endPng = path.join(work, "end.png");
  await endCard(layout, ["את כל הסיפורים, עם ניקוד ואיורים,", "אפשר לקרוא באתר"], endPng);
  parts.push(await stillSegment(layout, endPng, 6, path.join(work, "end.mp4")));

  const list = path.join(work, "parts.txt");
  writeFileSync(list, parts.map((s) => `file '${s.file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const video = path.join(outDir, "video.mp4");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", video]);

  const lines = ["TITLE:", `${title} | ${books.length} סיפורים מוקראים לילדים עם ניקוד`.slice(0, 100), "", "DESCRIPTION:"];
  lines.push(`${books.length} סיפורים מוקראים ברצף, עם ניקוד ואיורים: ${books.map(plainTitle).join(", ")}.`, "");
  lines.push(`📖 את כל הסיפורים אפשר לקרוא באתר: ${SITE}/?utm_source=youtube&utm_medium=video&utm_campaign=${name}`, "", "פרקים:");
  let t = 0;
  for (const part of parts) {
    if (part.chapter) lines.push(`${chapterTimestamp(t)} ${part.chapter}`);
    t += part.seconds;
  }
  lines.push("", "לקריאת כל סיפור באתר:", ...books.map((b) => `${plainTitle(b)}: ${bookLink(b, "youtube", "video")}`));
  lines.push("", "האיורים וההקראה נוצרו בעזרת כלי בינה מלאכותית ועברו עריכה ובדיקה של צוות האתר.");
  const tags = ["סיפורים לילדים", "סיפור מוקרא", "סיפורים מוקראים", "סיפורים עם ניקוד", title, ...books.map(plainTitle)];
  lines.push("", [...new Set(tags)].slice(0, 3).map((x) => `#${x.replace(/\s+/g, "_")}`).join(" "), "", "TAGS:", [...new Set(tags)].join(", "));
  writeFileSync(path.join(outDir, "youtube.txt"), lines.join("\n") + "\n");

  if (flags.has("--keep-work")) console.log(`  work files kept in ${work}`);
  else rmSync(work, { recursive: true, force: true });
  console.log(`  video.mp4 ${chapterTimestamp(duration(video))} -> ${outDir}`);
}

async function makeShort(book: BookWithPages, audio: PageAudio[], cover: string, work: string, outDir: string, soundtrack?: string) {
  const layout = PORTRAIT;
  const MAX = 55;
  const titlePng = path.join(work, "s-title.png");
  await titleCard(book, layout, cover, titlePng, "סיפור מוקרא · עם ניקוד");
  const segments: Segment[] = [await stillSegment(layout, titlePng, 2, path.join(work, "s-title.mp4"))];
  const END = 3.5;
  let used = 2 + END;
  for (let i = 0; i < book.pages.length; i++) {
    const room = MAX - used;
    const full = audio[i].seconds + PAGE_PAUSE;
    if (i > 0 && full > room) break;
    const segment = await pageSegment(book, i, audio[i], layout, work, "s", full > room ? room : undefined);
    segments.push(segment);
    used += segment.seconds;
    if (used >= 35) break;
  }
  const endPng = path.join(work, "s-end.png");
  const finished = segments.length - 1 >= book.pages.length;
  await endCard(layout, finished ? ["עוד סיפורים מוקראים", "עם ניקוד ואיורים:"] : ["איך זה נגמר?", "הסיפור המלא באתר:"], endPng);
  segments.push(await stillSegment(layout, endPng, END, path.join(work, "s-end.mp4")));
  finishVideo(segments, soundtrack, work, path.join(outDir, "short.mp4"));
}

function youtubeText(book: BookWithPages, segments: Segment[] | null): string {
  const title = plainTitle(book);
  const summary = stripNikud(book.summary).trim();
  const lines: string[] = [];
  lines.push("TITLE:");
  lines.push(`${title} | סיפור מוקרא לילדים עם ניקוד`.slice(0, 100));
  lines.push("", "DESCRIPTION:");
  if (summary) lines.push(summary, "");
  lines.push(`📖 לקריאת הסיפור עם ניקוד ואיורים: ${bookLink(book, "youtube", "video")}`);
  lines.push(`🌙 עוד סיפורים לפני השינה: ${SITE}/?utm_source=youtube&utm_medium=video&utm_campaign=channel`);
  lines.push("", `גיל מומלץ: ${book.ageGroup}`);
  if (segments) {
    lines.push("", "פרקים:");
    let t = 0;
    for (const s of segments) {
      if (s.chapter) lines.push(`${chapterTimestamp(t)} ${s.chapter}`);
      t += s.seconds;
    }
  }
  const people = creditPeople(book).map((c) => `${c.label}: ${c.value}`);
  const statements = creditStatements(book);
  lines.push("", "קרדיטים:", ...people, ...statements, `רישיון: ${book.license}`);
  if (book.origin === "ai" || /AI|בינה/i.test(book.illustrator)) {
    lines.push("", "האיורים וההקראה נוצרו בעזרת כלי בינה מלאכותית ועברו עריכה ובדיקה של צוות האתר.");
  }
  const tags = ["סיפורים לילדים", "סיפור מוקרא", "סיפור לפני השינה", "סיפורים עם ניקוד", title, ...book.tags.map(stripNikud)];
  lines.push("", [...new Set(tags)].slice(0, 3).map((t) => `#${t.replace(/\s+/g, "_")}`).join(" "));
  lines.push("", "TAGS:", [...new Set(tags)].join(", "));
  lines.push("", "SETTINGS: קהל – 'כן, התוכן מיועד לילדים' (Made for Kids). שפה: עברית.");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Podcast
// ---------------------------------------------------------------------------

function makePodcast(book: BookWithPages, audio: PageAudio[], work: string, out: string, soundtrack?: string): number {
  const args: string[] = ["-f", "lavfi", "-t", "2", "-i", "anullsrc=r=44100:cl=stereo"];
  audio.forEach((a) => args.push("-i", a.file));
  const parts: string[] = [];
  const labels: string[] = ["[s0]"];
  parts.push("[0:a]aformat=sample_rates=44100:channel_layouts=stereo[s0]");
  audio.forEach((_, i) => {
    const last = i === audio.length - 1;
    parts.push(
      `[${i + 1}:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,apad=pad_dur=${last ? 4 : 0.9}[p${i}]`,
    );
    labels.push(`[p${i}]`);
  });
  parts.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[voice]`);
  const voiceSeconds = 2 + audio.reduce((sum, a) => sum + a.seconds + 0.9, 0) + 3.1;
  const fadeAt = Math.max(0, voiceSeconds - 3).toFixed(2);
  if (soundtrack) {
    args.push("-stream_loop", "-1", "-i", soundtrack);
    parts.push(`[${audio.length + 1}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${MUSIC_VOLUME}[m]`);
    parts.push(`[voice][m]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${fadeAt}:d=3,loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
  } else {
    parts.push(`[voice]loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
  }
  ffmpeg([
    ...args,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-id3v2_version",
    "3",
    "-metadata",
    `title=${plainTitle(book)}`,
    "-metadata",
    "artist=הסיפור שלי",
    "-metadata",
    "genre=Kids & Family",
    out,
  ]);
  void work;
  return duration(out);
}

async function squareImage(file: string, size: number, out: string): Promise<void> {
  const background = await sharp(file).resize(size, size, { fit: "cover" }).blur(40).modulate({ brightness: 1.1 }).toBuffer();
  const front = await sharp(file).resize(size, size, { fit: "inside" }).toBuffer();
  await sharp(background).composite([{ input: front, gravity: "center" }]).jpeg({ quality: 88 }).toFile(out);
}

async function remoteStore(): Promise<MediaStore> {
  return isSupabaseConfigured() ? createSupabaseMediaStore() : new LocalMediaStore(dataDir());
}

async function readManifest(store: MediaStore, show: PodcastShowId): Promise<PodcastManifest> {
  const file = await store.get(podcastManifestPath(show));
  if (!file) return { episodes: [] };
  return PodcastManifestSchema.parse(JSON.parse(new TextDecoder().decode(file.bytes)));
}

async function writeManifest(store: MediaStore, show: PodcastShowId, manifest: PodcastManifest): Promise<void> {
  await store.put(podcastManifestPath(show), new TextEncoder().encode(JSON.stringify(manifest, null, 2)), "application/json");
}

async function makeShowCover(show: PodcastShowId, covers: string[], out: string): Promise<void> {
  const SIZE = 3000;
  const BAND = 760;
  const picked = covers.slice(0, 4);
  const cols = picked.length >= 2 ? 2 : 1;
  const rows = picked.length >= 3 ? 2 : 1;
  const cellW = SIZE / cols;
  const cellH = (SIZE - BAND) / rows;
  const tiles = await Promise.all(
    picked.map(async (file, i) => ({
      input: await sharp(file).resize(Math.round(cellW), Math.round(cellH), { fit: "cover" }).toBuffer(),
      left: Math.round((i % cols) * cellW),
      top: Math.round(Math.floor(i / cols) * cellH),
    })),
  );
  const meta = PODCAST_SHOWS[show];
  const [main, brand] = meta.title.split(" – ");
  const band =
    `<rect x="0" y="${SIZE - BAND}" width="${SIZE}" height="${BAND}" fill="${CREAM}"/>` +
    textRows(wrapPlain(main, 18), SIZE / 2, SIZE - BAND / 2 - 110, 230, 270, INK, 700) +
    textRows([brand ?? "הסיפור שלי"], SIZE / 2, SIZE - 130, 150, 160, ACCENT, 700);
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: CREAM } })
    .composite([...tiles, { input: svg(SIZE, SIZE, band), left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .toFile(out);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadBook(repo: LocalRepository, ref: string): Promise<BookWithPages> {
  const book = (await repo.getBookBySlug(ref)) ?? (await repo.getBookById(ref));
  if (!book) throw new Error(`no book "${ref}"`);
  return book;
}

function coverFile(book: BookWithPages): string {
  const cover = book.coverImage || book.pages.find((p) => p.image)?.image;
  if (!cover) throw new Error(`${book.slug}: no cover and no pictures`);
  return mediaFile(cover);
}

async function main(): Promise<void> {
  if (refs.length === 0) {
    console.error("usage: npm run export:media -- <slug|id>... [--video] [--short] [--podcast] [--publish <show>] (see the header of scripts/export-media.ts)");
    process.exit(1);
  }
  loadSiteFonts();
  const repo = new LocalRepository(dataDir());

  const compilation = option("--compilation");
  if (compilation) {
    if (!/^[a-z0-9-]+$/.test(compilation)) throw new Error(`--compilation takes a folder name (a-z, 0-9, -), got "${compilation}"`);
    const title = option("--title");
    if (!title) throw new Error(`--compilation needs --title "<video title>"`);
    const books = await Promise.all(refs.map((r) => loadBook(repo, r)));
    for (const book of books) {
      if (book.status !== "published" && !force) throw new Error(`${book.slug} is ${book.status}, not published (--force to use it anyway)`);
      if (book.pages.some((p) => !p.audio || p.audioSource === "mock")) throw new Error(`${book.slug}: not every page is narrated`);
    }
    console.log(`${compilation} – ${title}`);
    await makeCompilation(books, compilation, title);
    return;
  }

  if (showCover) {
    if (!isPodcastShow(showCover)) throw new Error(`unknown show "${showCover}" (${Object.keys(PODCAST_SHOWS).join(", ")})`);
    const books = await Promise.all(refs.map((r) => loadBook(repo, r)));
    mkdirSync(OUT_ROOT, { recursive: true });
    const out = path.join(OUT_ROOT, `podcast-${showCover}-cover.jpg`);
    await makeShowCover(showCover, books.map(coverFile), out);
    const store = await remoteStore();
    const manifest = await readManifest(store, showCover);
    const coverPath = `${podcastFolder(showCover)}/cover.jpg`;
    await store.put(coverPath, readFileSync(out), "image/jpeg");
    await writeManifest(store, showCover, { ...manifest, cover: coverPath });
    console.log(`show cover: ${out} -> ${store.kind}:${coverPath}`);
    return;
  }

  if (publishShow && !isPodcastShow(publishShow)) throw new Error(`unknown show "${publishShow}" (${Object.keys(PODCAST_SHOWS).join(", ")})`);
  if (/localhost|127\.0\.0\.1/.test(SITE)) {
    console.warn(`! links point to ${SITE}. Pass --site https://<real domain> (or set NEXT_PUBLIC_SITE_URL) before uploading anything.`);
  }
  const firstAt = option("--at") ? new Date(option("--at")!) : new Date();
  if (Number.isNaN(firstAt.getTime())) throw new Error(`bad --at "${option("--at")}"`);
  const everyDays = Number(option("--every") ?? "0");

  for (const [n, ref] of refs.entries()) {
    const book = await loadBook(repo, ref);
    console.log(`\n${book.slug} – ${plainTitle(book)}`);
    if (book.status !== "published" && !force) throw new Error(`${book.slug} is ${book.status}, not published (--force to export anyway)`);
    if (/\bND\b/i.test(book.license) && !force) throw new Error(`${book.slug}: license ${book.license} forbids derivatives`);
    const missing = book.pages.filter((p) => !p.audio || p.audioSource === "mock").map((p) => p.index + 1);
    if (missing.length > 0) throw new Error(`${book.slug}: pages without real narration: ${missing.join(", ")}`);

    const outDir = path.join(OUT_ROOT, book.slug);
    const work = mkdtempSync(path.join(os.tmpdir(), `mystory-export-${book.slug}-`));
    mkdirSync(outDir, { recursive: true });
    mkdirSync(work, { recursive: true });

    const audio: PageAudio[] = book.pages.map((p) => {
      const file = mediaFile(p.audio!);
      return { file, seconds: duration(file) };
    });
    const soundtrack = book.soundtrack ? mediaFile(book.soundtrack) : undefined;
    const cover = coverFile(book);

    let segments: Segment[] | null = null;
    if (want.video) {
      segments = await makeVideo(book, audio, cover, work, outDir, soundtrack);
      console.log(`  video.mp4 ${chapterTimestamp(duration(path.join(outDir, "video.mp4")))}          `);
    }
    if (want.short) {
      await makeShort(book, audio, cover, work, outDir, soundtrack);
      console.log(`  short.mp4 ${duration(path.join(outDir, "short.mp4")).toFixed(1)}s          `);
    }
    writeFileSync(path.join(outDir, "youtube.txt"), youtubeText(book, segments));

    if (want.podcast) {
      const mp3 = path.join(outDir, "podcast.mp3");
      const seconds = makePodcast(book, audio, work, mp3, soundtrack);
      const image = path.join(outDir, "episode.jpg");
      await squareImage(cover, 1400, image);
      console.log(`  podcast.mp3 ${chapterTimestamp(seconds)} (${(statSync(mp3).size / 1e6).toFixed(1)} MB)`);

      if (publishShow && isPodcastShow(publishShow)) {
        const store = await remoteStore();
        const folder = podcastFolder(publishShow);
        const audioPath = `${folder}/${book.slug}.mp3`;
        const imagePath = `${folder}/${book.slug}.jpg`;
        const bytes = readFileSync(mp3);
        await store.put(audioPath, bytes, "audio/mpeg");
        await store.put(imagePath, readFileSync(image), "image/jpeg");
        let manifest = await readManifest(store, publishShow);
        if (!manifest.cover) {
          const coverOut = path.join(OUT_ROOT, `podcast-${publishShow}-cover.jpg`);
          await makeShowCover(publishShow, [cover], coverOut);
          manifest = { ...manifest, cover: `${folder}/cover.jpg` };
          await store.put(manifest.cover!, readFileSync(coverOut), "image/jpeg");
          console.log(`  made a temporary show cover from this book (replace with --show-cover ${publishShow} <4 books>)`);
        }
        const publishAt = new Date(firstAt.getTime() + n * everyDays * 86_400_000).toISOString();
        const people = creditPeople(book).map((c) => `${c.label}: ${c.value}`).join(" · ");
        manifest = upsertEpisode(manifest, {
          bookId: book.id,
          slug: book.slug,
          title: plainTitle(book),
          description: [stripNikud(book.summary).trim(), people].filter(Boolean).join("\n\n"),
          audio: audioPath,
          bytes: bytes.length,
          durationSeconds: seconds,
          image: imagePath,
          publishAt,
          guid: `mystory-${publishShow}-${book.id}`,
        });
        await writeManifest(store, publishShow, manifest);
        console.log(`  published to ${store.kind}:${folder} (live ${publishAt})`);
      }
    }
    if (flags.has("--keep-work")) console.log(`  work files kept in ${work}`);
    else rmSync(work, { recursive: true, force: true });
    console.log(`  -> ${outDir}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
