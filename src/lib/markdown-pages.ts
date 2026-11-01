/**
 * Data for the Markdown versions of the public pages (src/lib/markdown.ts):
 * /llms.txt and the pages under src/app/md, which src/proxy.ts serves to
 * requests that prefer `Accept: text/markdown`. Server only.
 * Published books only, like the rest of the public library.
 */
import "server-only";
import { MAX_TAG_LENGTH } from "@/components/library/filters";
import { getCollectionWithBooks, listCollectionsWithBooks } from "@/components/library/queries";
import { normalizeSeason } from "@/components/library/seasons";
import { OCCASIONS, groupBooksByOccasion, occasionBookIds, occasionHref, occasionIndexable, occasionLabel } from "./occasions";
import { getRepo } from "./repo";
import type { BookFilter } from "./repo/types";
import { routes } from "./routes";
import { SITE_DESCRIPTION } from "./seo";
import {
  AGE_GROUP_INFO,
  CATEGORIES,
  READING_TIME_BUCKETS,
  THEMES,
  getAgeGroup,
  getCategory,
  getReadingTimeBucket,
  getTheme,
  listingIndexable,
  readingTimeBucket,
  tagFromSlug,
  tagIndexable,
  tagSlug,
} from "./taxonomy";
import { SLUG_PATTERN, bookAgeGroups, type Book } from "./types";
import {
  bookMarkdown,
  linksMarkdown,
  listingMarkdown,
  llmsTxt,
  markdownResponse,
  notFoundMarkdown,
  type LinkSection,
} from "./markdown";

const PUBLISHED = "published" as const;

/**
 * /llms.txt: the main pages, the browsing pages that are indexed (the same
 * rule as src/app/sitemap.ts, so thin listings are left out), the collections
 * with books and every published book.
 */
export async function loadLlmsTxt(): Promise<string> {
  const repo = await getRepo();
  const [{ books }, collections] = await Promise.all([
    repo.listBooks({ status: PUBLISHED, sort: "popular" }),
    repo.listCollections(),
  ]);

  const listing = (label: string, path: string, matching: Book[], note?: string) =>
    listingIndexable(matching.length, books.length) ? [{ label, path, note }] : [];

  const tags = new Map<string, { label: string; count: number }>();
  for (const book of books) {
    for (const tag of book.tags) {
      const key = tagSlug(tag);
      if (key === "") continue;
      const entry = tags.get(key) ?? { label: tag.trim(), count: 0 };
      entry.count += 1;
      tags.set(key, entry);
    }
  }

  const occasionBooks = groupBooksByOccasion(
    books,
    collections.map((c) => ({ season: normalizeSeason(c.season), bookIds: c.bookIds })),
  );
  const filled = await listCollectionsWithBooks(new Date());

  const sections: LinkSection[] = [
    {
      title: "עמודים ראשיים",
      links: [
        { label: "דף הבית", path: routes.home(), note: "ספרים חדשים, אהובים ומדפים לפי קטגוריה" },
        { label: "כל הספרים", path: routes.books(), note: "כל הספרייה, עם סינון לפי גיל, קטגוריה, זמן קריאה והקראה" },
        { label: "אוספים", path: routes.collections(), note: "ספרים שנבחרו יחד לעונות, לחגים ולרגעים מיוחדים" },
        { label: "פרשת השבוע", path: routes.parashot(), note: "סיפורים לילדים לפי פרשות השבוע" },
        { label: "חגים", path: routes.holidays(), note: "סיפורים לחגי ישראל" },
        { label: "האזנה", path: routes.listen(), note: "רצף סיפורים בהקראה, לפני השינה" },
        { label: "אודות", path: routes.about(), note: "מי אנחנו ואיך נבנית הספרייה" },
        { label: "שאלות נפוצות", path: routes.faq() },
      ],
    },
    {
      title: "לפי גיל",
      links: AGE_GROUP_INFO.flatMap((age) =>
        listing(`סיפורים ל${age.label}`, routes.age(age.slug), books.filter((b) => bookAgeGroups(b).includes(age.slug)), age.description),
      ),
    },
    {
      title: "לפי קטגוריה",
      links: CATEGORIES.flatMap((category) =>
        listing(
          category.searchTitle,
          routes.category(category.slug),
          books.filter((b) => b.categories.includes(category.slug)),
          category.description,
        ),
      ),
    },
    {
      title: "נושאים לשיחה",
      links: THEMES.flatMap((theme) =>
        listing(`סיפורים על ${theme.label}`, routes.theme(theme.slug), books.filter((b) => b.themes.includes(theme.slug))),
      ),
    },
    {
      title: "לפי זמן קריאה",
      links: READING_TIME_BUCKETS.flatMap((bucket) =>
        listing(
          `סיפורים של ${bucket.label}`,
          routes.time(bucket.slug),
          books.filter((b) => readingTimeBucket(b.readingMinutes) === bucket.slug),
        ),
      ),
    },
    {
      title: "פרשות וחגים",
      links: OCCASIONS.flatMap((occasion) =>
        occasionIndexable(occasionBookIds(occasionBooks, occasion).length)
          ? [{ label: occasionLabel(occasion), path: occasionHref(occasion) }]
          : [],
      ),
    },
    {
      title: "אוספים",
      links: filled.map(({ collection, books: inCollection }) => ({
        label: collection.title,
        path: routes.collection(collection.slug),
        note: collection.description || `${inCollection.length} ספרים`,
      })),
    },
    {
      title: "תגיות",
      links: [...tags.values()]
        .filter((tag) => tagIndexable(tag.count))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "he"))
        .map((tag) => ({ label: tag.label, path: routes.tag(tag.label) })),
    },
  ];

  return llmsTxt({ sections, books });
}

async function listing(base: BookFilter): Promise<Book[]> {
  const { books } = await (await getRepo()).listBooks({ ...base, status: PUBLISHED });
  return books;
}

/**
 * The Markdown answer for a public page, from its path segments without the
 * /md prefix ([] is the home page). 404 Markdown for anything else.
 */
export async function markdownPage(path: readonly string[]): Promise<Response> {
  const [section, param, ...rest] = path;
  if (rest.length > 0) return notFoundMarkdown();
  if (section === undefined) return markdownResponse(await loadLlmsTxt());

  if (param === undefined) {
    if (section === "books") {
      return markdownResponse(
        listingMarkdown({ title: "כל הספרים", description: SITE_DESCRIPTION, books: await listing({ sort: "new" }) }),
      );
    }
    if (section === "collections") {
      const filled = await listCollectionsWithBooks(new Date());
      return markdownResponse(
        linksMarkdown({
          title: "אוספים",
          description: "ספרים שנבחרו ביד וסודרו יחד: לעונות השנה, לחגים ולרגעים מיוחדים.",
          links: filled.map(({ collection, books }) => ({
            label: collection.title,
            path: routes.collection(collection.slug),
            note: `${books.length} ספרים${collection.description ? `. ${collection.description}` : ""}`,
          })),
        }),
      );
    }
    return notFoundMarkdown();
  }

  switch (section) {
    case "book": {
      if (!SLUG_PATTERN.test(param)) return notFoundMarkdown();
      const book = await (await getRepo()).getBookBySlug(param);
      // Only published books: drafts and private books have no public page.
      if (!book || book.status !== PUBLISHED) return notFoundMarkdown();
      return markdownResponse(bookMarkdown(book));
    }
    case "age": {
      const age = getAgeGroup(param);
      if (!age) return notFoundMarkdown();
      return markdownResponse(
        listingMarkdown({ title: `סיפורים ל${age.label}`, description: age.description, books: await listing({ ageGroup: age.slug }) }),
      );
    }
    case "category": {
      const category = getCategory(param);
      if (!category) return notFoundMarkdown();
      return markdownResponse(
        listingMarkdown({
          title: category.searchTitle ?? category.label,
          description: category.description,
          books: await listing({ category: category.slug }),
        }),
      );
    }
    case "theme": {
      const theme = getTheme(param);
      if (!theme) return notFoundMarkdown();
      return markdownResponse(
        listingMarkdown({
          title: `סיפורים על ${theme.label}`,
          description: "ספרים שעוזרים לפתוח שיחה על הנושא הזה. בעמוד של כל ספר מחכות שאלות לשיחה.",
          books: await listing({ theme: theme.slug }),
        }),
      );
    }
    case "time": {
      const bucket = getReadingTimeBucket(param);
      if (!bucket) return notFoundMarkdown();
      return markdownResponse(
        listingMarkdown({ title: `סיפורים של ${bucket.label}`, books: await listing({ timeBucket: bucket.slug }) }),
      );
    }
    case "tag": {
      const label = tagFromSlug(param);
      if (label === "" || label.length > MAX_TAG_LENGTH) return notFoundMarkdown();
      const books = await listing({ tag: label });
      // Prefer the spelling stored on the books over the one rebuilt from the URL.
      const stored = books.flatMap((book) => book.tags).find((tag) => tagSlug(tag) === tagSlug(label));
      return markdownResponse(listingMarkdown({ title: `סיפורים לילדים: ${stored?.trim() ?? label}`, books }));
    }
    case "collections": {
      if (!SLUG_PATTERN.test(param)) return notFoundMarkdown();
      const filled = await getCollectionWithBooks(param);
      if (!filled) return notFoundMarkdown();
      return markdownResponse(
        listingMarkdown({ title: filled.collection.title, description: filled.collection.description, books: filled.books }),
      );
    }
    default:
      return notFoundMarkdown();
  }
}
