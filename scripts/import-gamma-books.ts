/**
 * Builds the picture books that were written and illustrated in Gamma as DRAFTS.
 *
 *   npx tsx scripts/import-gamma-books.ts --src <folder> [--force] [--check]
 *
 * <folder> holds one sub-folder per Gamma deck with the images pulled out of the
 * exported PPTX (the same names the specs refer to, e.g. s03_1.jpeg).
 * The proofread texts live in scripts/gamma-books/books-*.json.
 *
 * Pictures are never cut: every page picture keeps its own shape (the reader
 * shows it with object-contain), and the cover is placed whole inside a 3:4
 * card over a soft blur of itself, so the library cards do not crop it either.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { LocalRepository } from "../src/lib/repo/local";
import { CATEGORY_SLUGS, THEME_SLUGS } from "../src/lib/taxonomy";

type Spec = {
  id: string;
  slug: string;
  deck: string;
  title: string;
  summary: string;
  ageGroup: "0-2" | "3-5" | "6-8";
  categories: string[];
  themes: string[];
  tags: string[];
  discussionQuestions: string[];
  cover: string;
  pages: { img?: string; text: string }[];
};

// The account that owns the AI books made for the site.
const OWNER_ID = "u_m3ipvar7h1mb";
const PAPER = { r: 251, g: 245, b: 232 };
const PAGE_WIDTH = 1400;
const COVER_W = 900;
const COVER_H = 1200;

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function loadSpecs(): Spec[] {
  const dir = path.join(process.cwd(), "scripts", "gamma-books");
  return readdirSync(dir)
    .filter((file) => /^books-.*\.json$/.test(file))
    .sort()
    .flatMap((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Spec[]);
}

function problems(spec: Spec, src: string): string[] {
  const out: string[] = [];
  if (!/^ai-[a-z0-9-]+$/.test(spec.id)) out.push("id must look like ai-<slug>");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.slug)) out.push("slug must be a latin slug");
  for (const c of spec.categories) if (!CATEGORY_SLUGS.includes(c)) out.push(`unknown category ${c}`);
  for (const t of spec.themes) if (!THEME_SLUGS.includes(t)) out.push(`unknown theme ${t}`);
  if (spec.discussionQuestions.length < 2) out.push("needs at least 2 discussion questions");
  const images = [spec.cover, ...spec.pages.map((page) => page.img).filter((img): img is string => !!img)];
  for (const img of images) if (!existsSync(path.join(src, spec.deck, img))) out.push(`missing image ${spec.deck}/${img}`);
  for (const [i, page] of spec.pages.entries()) {
    if (page.text.trim() === "") out.push(`page ${i + 1} is empty`);
    if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(page.text)) out.push(`page ${i + 1} has an emoji`);
    if (page.text.includes('"')) out.push(`page ${i + 1} has an ASCII double quote`);
  }
  return out;
}

async function writePage(from: string, to: string): Promise<void> {
  await sharp(from)
    .flatten({ background: PAPER })
    .resize({ width: PAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(to);
}

/** The whole picture on a 3:4 card, over a blurred copy of itself: nothing is cropped. */
async function writeCover(from: string, to: string): Promise<void> {
  const flat = await sharp(from).flatten({ background: PAPER }).jpeg({ quality: 92 }).toBuffer();
  const backdrop = await sharp(flat).resize(COVER_W, COVER_H, { fit: "cover" }).blur(28).modulate({ brightness: 1.05 }).toBuffer();
  const front = await sharp(flat).resize(COVER_W, COVER_H, { fit: "inside" }).toBuffer();
  await sharp(backdrop)
    .composite([{ input: front, gravity: "centre" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(to);
}

async function main(): Promise<void> {
  const src = arg("--src");
  if (!src) throw new Error("usage: import-gamma-books.ts --src <folder> [--force] [--check]");
  const force = process.argv.includes("--force");
  const specs = loadSpecs();

  const slugs = new Set<string>();
  let bad = 0;
  for (const spec of specs) {
    const list = problems(spec, src);
    if (slugs.has(spec.slug)) list.push("duplicate slug");
    slugs.add(spec.slug);
    if (list.length > 0) {
      bad += 1;
      console.error(`✗ ${spec.id}\n   ${list.join("\n   ")}`);
    }
  }
  if (bad > 0) throw new Error(`${bad} spec(s) have problems`);
  console.log(`${specs.length} specs are valid.`);
  if (process.argv.includes("--check")) return;

  const root = path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  for (const spec of specs) {
    const existing = (await repo.getBookById(spec.id)) ?? (await repo.getBookBySlug(spec.slug));
    if (existing) {
      if (!force) {
        console.log(`skip ${spec.id}: already in the library (use --force to rebuild a draft)`);
        continue;
      }
      if (existing.status !== "draft") throw new Error(`${spec.id} is ${existing.status}; --force rebuilds drafts only`);
      await repo.deleteBook(existing.id);
    }

    const media = path.join(root, "media", "books", spec.id);
    await rm(media, { recursive: true, force: true });
    await mkdir(media, { recursive: true });
    await writeCover(path.join(src, spec.deck, spec.cover), path.join(media, "cover.jpg"));
    const pageFile = (i: number) => `page-${String(i + 1).padStart(2, "0")}.jpg`;
    for (const [i, page] of spec.pages.entries()) {
      if (page.img) await writePage(path.join(src, spec.deck, page.img), path.join(media, pageFile(i)));
    }

    const book = await repo.createBook({
      id: spec.id,
      slug: spec.slug,
      title: spec.title,
      summary: spec.summary,
      author: "דוד בר אור",
      illustrator: "אויר בעזרת בינה מלאכותית",
      license: "לשימוש אישי",
      source: "נכתב ואויר בעזרת בינה מלאכותית",
      ageGroup: spec.ageGroup,
      coverImage: `books/${spec.id}/cover.jpg`,
      status: "draft",
      ownerId: OWNER_ID,
      categories: spec.categories,
      themes: spec.themes,
      tags: spec.tags,
      discussionQuestions: spec.discussionQuestions,
      origin: "ai",
      viewCount: 0,
      language: "he",
      pages: spec.pages.map((page, index) => ({
        index,
        text: page.text,
        ...(page.img ? { image: `books/${spec.id}/${pageFile(index)}` } : {}),
      })),
    });
    console.log(`created ${book.id} (${book.slug}): ${book.pages.length} pages, ${book.readingMinutes} min`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
