import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { AGE_GROUP_INFO, CATEGORIES, READING_TIME_BUCKETS, THEMES } from "@/lib/taxonomy";

// Books are published at any time, so the sitemap is built on request.
export const dynamic = "force-dynamic";

type Entry = MetadataRoute.Sitemap[number];

function latest(dates: (string | undefined)[]): Date | undefined {
  let best = 0;
  for (const value of dates) {
    const time = value ? Date.parse(value) : Number.NaN;
    if (Number.isFinite(time) && time > best) best = time;
  }
  return best > 0 ? new Date(best) : undefined;
}

/** Cover and page illustrations of a book, for Google Images (the cover first). */
function bookImages(book: { coverImage: string; updatedAt: string; pages?: { image?: string }[] }): string[] {
  const paths = [book.coverImage, ...(book.pages ?? []).map((page) => page.image ?? "")];
  const urls = paths.map((path) => absoluteUrl(mediaUrl(path, book.updatedAt))).filter((url): url is string => !!url);
  return [...new Set(urls)].slice(0, 50);
}

/** Every public page: the fixed pages, the browsing pages of the taxonomy, collections and published books. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entry = (path: string, extra: Omit<Entry, "url"> = {}): Entry => ({ url: `${base}${path}`, ...extra });

  const entries: Entry[] = [
    entry(routes.home(), { changeFrequency: "daily", priority: 1 }),
    entry(routes.books(), { changeFrequency: "daily", priority: 0.9 }),
    entry(routes.collections(), { changeFrequency: "weekly", priority: 0.7 }),
    entry(routes.listen(), { changeFrequency: "weekly", priority: 0.7 }),
    entry(routes.about(), { changeFrequency: "monthly", priority: 0.4 }),
    entry(routes.faq(), { changeFrequency: "monthly", priority: 0.4 }),
    // /privacy and /terms are noindex, so they are not listed.
    ...AGE_GROUP_INFO.map((age) => entry(routes.age(age.slug), { changeFrequency: "weekly", priority: 0.8 })),
    ...CATEGORIES.map((category) => entry(routes.category(category.slug), { changeFrequency: "weekly", priority: 0.7 })),
    ...THEMES.map((theme) => entry(routes.theme(theme.slug), { changeFrequency: "weekly", priority: 0.5 })),
    ...READING_TIME_BUCKETS.map((bucket) => entry(routes.time(bucket.slug), { changeFrequency: "weekly", priority: 0.5 })),
  ];

  try {
    const repo = await getRepo();
    const [{ books }, collections] = await Promise.all([repo.listBooks({ status: "published" }), repo.listCollections()]);

    // Page illustrations live on the full book; read them alongside (a missing one only loses its images).
    const fullBooks = await Promise.all(books.map((book) => repo.getBookBySlug(book.slug).catch(() => null)));
    for (const [index, listed] of books.entries()) {
      const book = fullBooks[index] ?? listed;
      entries.push(
        entry(routes.book(book.slug), {
          lastModified: latest([book.updatedAt, book.publishedAt]),
          changeFrequency: "monthly",
          priority: 0.8,
          images: bookImages(book),
        }),
      );
    }

    const publishedIds = new Set(books.map((book) => book.id));
    for (const collection of collections) {
      // An empty collection page has nothing to index.
      if (!collection.bookIds.some((id) => publishedIds.has(id))) continue;
      entries.push(entry(routes.collection(collection.slug), { changeFrequency: "weekly", priority: 0.6 }));
    }

    // Only tags that lead to at least one published book.
    const tags = new Set<string>();
    for (const book of books) for (const tag of book.tags) if (tag.trim()) tags.add(tag.trim());
    for (const tag of [...tags].sort((a, b) => a.localeCompare(b, "he"))) {
      entries.push(entry(routes.tag(tag), { changeFrequency: "weekly", priority: 0.4 }));
    }
  } catch (err) {
    // The fixed pages are still worth listing when the data store is unavailable.
    console.error("[sitemap] could not list books", err);
  }

  return entries;
}
