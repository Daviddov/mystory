/**
 * Creates a published AI picture book in the local library from a spec file.
 *
 *   npx tsx .claude/skills/ai-picture-book/scripts/create-book.ts <spec.json> <img-folder>
 *
 * Run from the project root. <img-folder> holds cover.png and page-NN.png (Gemini
 * output); they are stored as WebP in data/media/books/<id>/ (the PNGs kept in
 * data/originals/media/books/<id>/). Refuses an id or slug that exists.
 * Spec format: ../references/spec-example.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertBookImages, bookImageNames, pageImageName, storeBookImages } from "../../../../scripts/lib/book-images";
import { LocalRepository } from "../../../../src/lib/repo/local";

type Spec = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  ageGroup: "0-2" | "3-5" | "6-8";
  categories: string[];
  themes: string[];
  tags: string[];
  discussionQuestions: string[];
  source?: string;
  pages: { text: string; alt: string }[];
};

// The account that owns the AI books made for the site.
const OWNER_ID = "u_m3ipvar7h1mb";

async function main(): Promise<void> {
  const [specPath, imgDir] = process.argv.slice(2);
  if (!specPath || !imgDir) throw new Error("usage: create-book.ts <spec.json> <img-folder>");
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  if (!/^ai-[a-z0-9-]+$/.test(spec.id)) throw new Error(`id must look like ai-<slug>: ${spec.id}`);

  const root = path.join(process.cwd(), "data");
  const names = bookImageNames(spec.pages.length);
  assertBookImages(imgDir, names);

  const repo = new LocalRepository(root);
  if ((await repo.getBookById(spec.id)) || (await repo.getBookBySlug(spec.slug))) {
    throw new Error(`a book with id ${spec.id} or slug ${spec.slug} already exists`);
  }
  const images = await storeBookImages(root, spec.id, imgDir, names);

  const book = await repo.createBook({
    id: spec.id,
    slug: spec.slug,
    title: spec.title,
    summary: spec.summary,
    author: "נכתב בעזרת בינה מלאכותית",
    illustrator: "אויר בעזרת בינה מלאכותית",
    license: "לשימוש אישי",
    source: spec.source ?? "נכתב ואויר בעזרת בינה מלאכותית",
    ageGroup: spec.ageGroup,
    coverImage: images.get("cover"),
    status: process.env.BOOK_STATUS === "draft" ? "draft" : "published",
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
      image: images.get(pageImageName(index)),
      imageAlt: page.alt,
    })),
  });
  console.log(`created ${book.id} (${book.slug}): ${book.pages.length} pages, ${book.readingMinutes} min`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
