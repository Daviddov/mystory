/**
 * Creates a published AI picture book in the local library from a spec file.
 *
 *   npx tsx .claude/skills/ai-picture-book/scripts/create-book.ts <spec.json>
 *
 * Run from the project root, after convert-images.py put cover.jpg and
 * page-NN.jpg in data/media/books/<id>/. Refuses an id or slug that exists.
 * Spec format: ../references/spec-example.json.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
  const specPath = process.argv[2];
  if (!specPath) throw new Error("usage: create-book.ts <spec.json>");
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  if (!/^ai-[a-z0-9-]+$/.test(spec.id)) throw new Error(`id must look like ai-<slug>: ${spec.id}`);

  const root = path.join(process.cwd(), "data");
  const media = path.join(root, "media", "books", spec.id);
  const pageFile = (i: number) => `page-${String(i + 1).padStart(2, "0")}.jpg`;
  const missing = ["cover.jpg", ...spec.pages.map((_, i) => pageFile(i))].filter((f) => !existsSync(path.join(media, f)));
  if (missing.length > 0) throw new Error(`missing images in ${media}: ${missing.join(", ")}`);

  const repo = new LocalRepository(root);
  if ((await repo.getBookById(spec.id)) || (await repo.getBookBySlug(spec.slug))) {
    throw new Error(`a book with id ${spec.id} or slug ${spec.slug} already exists`);
  }

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
    coverImage: `books/${spec.id}/cover.jpg`,
    status: "published",
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
      image: `books/${spec.id}/${pageFile(index)}`,
      imageAlt: page.alt,
    })),
  });
  console.log(`created ${book.id} (${book.slug}): ${book.pages.length} pages, ${book.readingMinutes} min`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
