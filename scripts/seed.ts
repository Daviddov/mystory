/**
 * Seeds the sample library into the data directory (default ./data):
 * six published books with SVG illustrations, two collections and the book
 * of the week.
 *
 *   npm run seed            write / refresh the sample books
 *
 * Re-running is safe: only records whose id starts with "seed-" are replaced
 * (their view counts are kept); books created by users are left untouched,
 * and the book of the week is only set when none is chosen yet.
 */
import path from "node:path";
import { LocalMediaStore } from "../src/lib/media/local";
import { bookMediaPath, bookMediaPrefix } from "../src/lib/media/url";
import { writeJsonAtomic } from "../src/lib/repo/fs-util";
import { LocalRepository } from "../src/lib/repo/local";
import { BookWithPagesSchema, SYSTEM_OWNER_ID, type BookWithPages, type Page } from "../src/lib/types";
import { hasNikud, splitWords } from "../src/lib/hebrew";
import { CATEGORY_SLUGS, THEME_SLUGS } from "../src/lib/taxonomy";
import { scene } from "./seed/art";
import {
  SEED_AUTHOR,
  SEED_BOOK_OF_THE_WEEK,
  SEED_COLLECTIONS,
  SEED_ILLUSTRATOR,
  SEED_LICENSE,
  SEED_SOURCE,
  STORIES,
} from "./seed/stories";

async function main(): Promise<void> {
  const root = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);
  const encoder = new TextEncoder();

  for (const story of STORIES) {
    for (const slug of [...story.categories]) {
      if (!CATEGORY_SLUGS.includes(slug)) throw new Error(`${story.slug}: unknown category ${slug}`);
    }
    for (const slug of story.themes) {
      if (!THEME_SLUGS.includes(slug)) throw new Error(`${story.slug}: unknown theme ${slug}`);
    }

    const existing = await repo.getBookById(story.id);
    await media.deletePrefix(bookMediaPrefix(story.id));

    const coverPath = bookMediaPath(story.id, "cover.svg");
    await media.put(coverPath, encoder.encode(story.cover), "image/svg+xml");

    const pages: Page[] = [];
    for (const [index, page] of story.pages.entries()) {
      if (page.textNikud !== undefined) {
        if (!hasNikud(page.textNikud)) throw new Error(`${story.slug} page ${index + 1}: textNikud has no nikud`);
        if (splitWords(page.textNikud).length !== splitWords(page.text).length) {
          throw new Error(`${story.slug} page ${index + 1}: text and textNikud differ in word count`);
        }
      }
      const imagePath = bookMediaPath(story.id, `page-${String(index + 1).padStart(2, "0")}.svg`);
      await media.put(imagePath, encoder.encode(scene(page.art, page.alt)), "image/svg+xml");
      pages.push({
        index,
        text: page.text,
        ...(page.textNikud !== undefined ? { textNikud: page.textNikud } : {}),
        image: imagePath,
      });
    }

    const book: BookWithPages = BookWithPagesSchema.parse({
      id: story.id,
      slug: story.slug,
      title: story.title,
      summary: story.summary,
      author: SEED_AUTHOR,
      illustrator: SEED_ILLUSTRATOR,
      license: SEED_LICENSE,
      source: SEED_SOURCE,
      ageGroup: story.ageGroup,
      readingMinutes: story.readingMinutes,
      coverImage: coverPath,
      status: "published",
      ownerId: SYSTEM_OWNER_ID,
      categories: story.categories,
      tags: story.tags,
      themes: story.themes,
      discussionQuestions: story.discussionQuestions,
      origin: "manual",
      viewCount: existing?.viewCount ?? story.viewCount,
      createdAt: story.publishedAt,
      updatedAt: story.publishedAt,
      publishedAt: story.publishedAt,
      pages,
    });

    if (existing && existing.slug !== book.slug) await repo.deleteBook(existing.id);
    await writeJsonAtomic(path.join(root, "books", book.slug, "book.json"), book);
    console.log(`seeded ${book.slug} (${pages.length} pages)`);
  }

  for (const collection of SEED_COLLECTIONS) {
    if (await repo.getCollectionById(collection.id)) await repo.updateCollection(collection.id, collection);
    else await repo.createCollection(collection);
    console.log(`seeded collection ${collection.slug}`);
  }

  const settings = await repo.getSettings();
  if (!settings.bookOfTheWeekId) {
    await repo.setSettings({ bookOfTheWeekId: SEED_BOOK_OF_THE_WEEK });
    console.log(`book of the week: ${SEED_BOOK_OF_THE_WEEK}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
