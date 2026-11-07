import type { MetadataRoute } from "next";
import { normalizeSeason } from "@/components/library/seasons";
import { siteUrl } from "@/lib/config";
import { englishPath, hasEnglishPage } from "@/lib/i18n/paths";
import { OCCASIONS, groupBooksByOccasion, occasionBookIds, occasionHref, occasionIndexable } from "@/lib/occasions";
import { getRepo } from "@/lib/repo";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { AGE_GROUP_INFO, CATEGORIES, READING_TIME_BUCKETS, THEMES, listingIndexable, readingTimeBucket, tagIndexable, tagSlug } from "@/lib/taxonomy";
import { bookAgeGroups, type Book, type Collection } from "@/lib/types";

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

/**
 * Every public page: the fixed pages, the browsing pages of the taxonomy,
 * collections and published books. Listings carry the lastmod of their newest
 * book, so search engines can trust it and recrawl only what changed.
 */
async function hebrewEntries(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entry = (path: string, extra: Omit<Entry, "url"> = {}): Entry => ({ url: `${base}${path}`, ...extra });

  const fixed = (lastModified?: Date): Entry[] => [
    entry(routes.home(), { lastModified, changeFrequency: "daily", priority: 1 }),
    entry(routes.books(), { lastModified, changeFrequency: "daily", priority: 0.9 }),
    entry(routes.collections(), { changeFrequency: "weekly", priority: 0.7 }),
    entry(routes.parashot(), { changeFrequency: "weekly", priority: 0.7 }),
    entry(routes.holidays(), { changeFrequency: "weekly", priority: 0.7 }),
    entry(routes.listen(), { changeFrequency: "weekly", priority: 0.7 }),
    entry(routes.personalBook(), { changeFrequency: "monthly", priority: 0.8 }),
    entry(routes.about(), { changeFrequency: "monthly", priority: 0.4 }),
    entry(routes.faq(), { changeFrequency: "monthly", priority: 0.4 }),
    // /privacy and /terms are noindex, so they are not listed.
  ];

  let books: Book[];
  let collections: Collection[];
  try {
    const repo = await getRepo();
    [{ books }, collections] = await Promise.all([repo.listBooks({ status: "published" }), repo.listCollections()]);
  } catch (err) {
    // The fixed and taxonomy pages are still worth listing when the data store is unavailable.
    console.error("[sitemap] could not list books", err);
    return [
      ...fixed(),
      ...AGE_GROUP_INFO.map((age) => entry(routes.age(age.slug), { changeFrequency: "weekly", priority: 0.8 })),
      ...CATEGORIES.map((category) => entry(routes.category(category.slug), { changeFrequency: "weekly", priority: 0.7 })),
      ...THEMES.map((theme) => entry(routes.theme(theme.slug), { changeFrequency: "weekly", priority: 0.5 })),
      ...READING_TIME_BUCKETS.map((bucket) => entry(routes.time(bucket.slug), { changeFrequency: "weekly", priority: 0.5 })),
    ];
  }

  // A listing changes when one of its books does: its lastmod is that of its newest book.
  const bookModified = (book: Book) => latest([book.updatedAt, book.publishedAt]);
  const newest = (list: readonly Book[]) => latest(list.map((book) => bookModified(book)?.toISOString()));
  const byId = new Map(books.map((book) => [book.id, book]));
  const newestOf = (ids: readonly string[]) => newest(ids.map((id) => byId.get(id)).filter((book): book is Book => !!book));

  // Age, category, theme and reading-time pages that are thin or repeat /books are noindex (see listingIndexable).
  const listing = (path: string, matching: Book[], priority: number): Entry[] =>
    listingIndexable(matching.length, books.length)
      ? [entry(path, { lastModified: newest(matching), changeFrequency: "weekly", priority })]
      : [];

  const entries: Entry[] = [
    ...fixed(newest(books)),
    ...AGE_GROUP_INFO.flatMap((age) =>
      listing(routes.age(age.slug), books.filter((book) => bookAgeGroups(book).includes(age.slug)), 0.8),
    ),
    ...CATEGORIES.flatMap((category) =>
      listing(routes.category(category.slug), books.filter((book) => book.categories.includes(category.slug)), 0.7),
    ),
    ...THEMES.flatMap((theme) =>
      listing(routes.theme(theme.slug), books.filter((book) => book.themes.includes(theme.slug)), 0.5),
    ),
    ...READING_TIME_BUCKETS.flatMap((bucket) =>
      listing(routes.time(bucket.slug), books.filter((book) => readingTimeBucket(book.readingMinutes) === bucket.slug), 0.5),
    ),
  ];

  // Page illustrations live on the full book; read them alongside (a missing one only loses its images).
  const repo = await getRepo();
  const fullBooks = await Promise.all(books.map((book) => repo.getBookBySlug(book.slug).catch(() => null)));
  for (const [index, listed] of books.entries()) {
    const book = fullBooks[index] ?? listed;
    entries.push(
      entry(routes.book(book.slug), {
        lastModified: bookModified(book),
        changeFrequency: "monthly",
        priority: 0.8,
        images: bookImages(book),
      }),
    );
  }

  for (const collection of collections) {
    // An empty collection page has nothing to index.
    const lastModified = newestOf(collection.bookIds);
    if (!lastModified) continue;
    entries.push(entry(routes.collection(collection.slug), { lastModified, changeFrequency: "weekly", priority: 0.6 }));
  }

  // Only tags with enough books to be indexed (thinner tag pages are noindex), under the books' own spelling.
  const tags = new Map<string, { label: string; books: Book[] }>();
  for (const book of books) {
    for (const tag of book.tags) {
      const key = tagSlug(tag);
      if (key === "") continue;
      const group = tags.get(key) ?? { label: tag.trim(), books: [] };
      group.books.push(book);
      tags.set(key, group);
    }
  }
  for (const { label, books: tagged } of [...tags.values()].sort((a, b) => a.label.localeCompare(b.label, "he"))) {
    if (!tagIndexable(tagged.length)) continue;
    entries.push(entry(routes.tag(label), { lastModified: newest(tagged), changeFrequency: "weekly", priority: 0.4 }));
  }

  // Parasha and holiday pages are noindex until they have a book, so only those with books are listed.
  const seasons = collections.map((c) => ({ season: normalizeSeason(c.season), bookIds: c.bookIds }));
  const occasionBooks = groupBooksByOccasion(books, seasons);
  for (const occasion of OCCASIONS) {
    const ids = occasionBookIds(occasionBooks, occasion);
    if (!occasionIndexable(ids.length)) continue;
    entries.push(entry(occasionHref(occasion), { lastModified: newestOf(ids), changeFrequency: "weekly", priority: 0.6 }));
  }

  return entries;
}

/**
 * Every page that has an English twin (/en/...) is listed in both languages,
 * each entry naming the other (hreflang), as Google asks. The English entry
 * carries no images: they belong to the Hebrew page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries = await hebrewEntries();
  return entries.flatMap((entry) => {
    const path = entry.url.slice(base.length) || "/";
    if (!entry.url.startsWith(base) || !hasEnglishPage(path)) return [entry];
    const english = `${base}${englishPath(path)}`;
    const alternates = { languages: { he: entry.url, en: english, "x-default": entry.url } };
    return [
      { ...entry, alternates },
      { ...entry, url: english, images: undefined, alternates },
    ];
  });
}
