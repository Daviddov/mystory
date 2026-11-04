import type { Metadata } from "next";
import { BookRow } from "@/components/BookRow";
import {
  hrefWith,
  parseLibraryQuery,
  toParams,
  type LibraryQuery,
  type RawSearchParams,
} from "@/components/library/filters";
import { InfiniteBookGrid } from "@/components/library/InfiniteBookGrid";
import { listingApiUrl, type ListingScope } from "@/components/library/infinite";
import { toListingItems } from "@/components/library/listing";
import { PageHeading } from "@/components/library/PageHeading";
import { listLibraryBooks, listPopularBooks, listTagCounts } from "@/components/library/queries";
import { SearchForm } from "@/components/library/SearchForm";
import { SortChips } from "@/components/library/SortChips";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { libraryMessages } from "@/lib/i18n/library";
import type { Locale } from "@/lib/i18n/locale";
import { getMessages, taxonomyText } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { navFor } from "@/lib/nav";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseLibraryQuery(await searchParams);
  return {
    title: q ? `חיפוש: ${q}` : "חיפוש ספרים",
    description: "חיפוש חופשי בספריית הסיפורים: לפי שם הספר, המחבר, התגיות או מילים מתוך הסיפור.",
    alternates: { canonical: routes.search() },
    // Result pages depend on what the visitor typed and should not be indexed.
    robots: q ? { index: false, follow: true } : undefined,
  };
}

/** Suggestions shown before a search and when nothing was found. */
async function Suggestions({ locale }: { locale: Locale }) {
  const t = libraryMessages(locale).search;
  const [tags, popular] = await Promise.all([
    listTagCounts(16),
    listPopularBooks(12),
  ]);
  return (
    <>
      {tags.length > 0 ? (
        <section aria-labelledby="search-tags-title" className="flex flex-col gap-3">
          <h2 id="search-tags-title" className="text-2xl font-bold">
            <span aria-hidden="true">🏷️ </span>
            {t.popularTags}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.label}>
                <Chip href={routes.tag(tag.label)}>{taxonomyText(locale, "tag", tag.label, tag).label}</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="search-categories-title" className="flex flex-col gap-3">
        <h2 id="search-categories-title" className="text-2xl font-bold">
          <span aria-hidden="true">🗂️ </span>
          {t.categories}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {navFor(locale).category.map((item) => (
            <li key={item.href}>
              <Chip href={item.href} icon={item.emoji} tone="secondary">
                {item.label}
              </Chip>
            </li>
          ))}
        </ul>
      </section>
      <BookRow title={t.popular} emoji="🏆" books={popular} href={routes.books({ sort: "popular" })} locale={locale} />
    </>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const parsed = parseLibraryQuery(await searchParams);
  // Only the text, the sort order and the page are used here.
  const query: LibraryQuery = { q: parsed.q, sort: parsed.sort, page: parsed.page };
  const path = routes.search();
  const listing = query.q ? await listLibraryBooks(query) : null;
  const shown: LibraryQuery = { ...query, page: listing?.page ?? 1 };
  const scope: ListingScope = { kind: "search" };
  const listParams = toParams({ ...shown, page: undefined });
  const locale = await getLocale();
  const t = libraryMessages(locale).search;

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        title={t.title}
        emoji="🔎"
        description={t.description}
        crumbs={[{ label: t.crumb }]}
        locale={locale}
      >
        <SearchForm defaultValue={query.q} size="lg" autoFocus={!query.q} locale={locale} className="max-w-2xl" />
      </PageHeading>

      {listing && query.q ? (
        <section aria-labelledby="search-results-title" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 id="search-results-title" className="text-2xl font-bold" role="status">
              {listing.total === 0
                ? t.nothingFor(query.q)
                : t.foundFor(getMessages(locale).library.bookCount(listing.total), query.q)}
            </h2>
            {listing.total > 1 ? (
              <SortChips current={shown.sort} hrefFor={(sort) => hrefWith(path, shown, { sort })} locale={locale} />
            ) : null}
          </div>
          {listing.books.length > 0 ? (
            <InfiniteBookGrid
              // A new search text or sort order starts over instead of keeping the loaded pages.
              key={listingApiUrl(scope, listParams, 1)}
              scope={scope}
              path={path}
              params={listParams}
              initialItems={toListingItems(listing.books, listing.now)}
              page={listing.page}
              pages={listing.pages}
            />
          ) : (
            <EmptyState
              icon="🔍"
              title={t.noResultsTitle}
              description={t.noResultsDescription}
              action={<ButtonLink href={routes.books()}>{t.allBooks}</ButtonLink>}
            />
          )}
        </section>
      ) : null}

      {!listing || listing.total === 0 ? <Suggestions locale={locale} /> : null}
    </main>
  );
}
