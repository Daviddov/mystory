import type { Metadata } from "next";
import { X } from "lucide-react";
import { FilterForm } from "@/components/library/FilterForm";
import {
  describeActiveFilters,
  hasActiveFilters,
  hrefWith,
  parseLibraryQuery,
  toParams,
  type RawSearchParams,
} from "@/components/library/filters";
import { InfiniteBookGrid } from "@/components/library/InfiniteBookGrid";
import { listingApiUrl, type ListingScope } from "@/components/library/infinite";
import { toListingItems } from "@/components/library/listing";
import { PageHeading } from "@/components/library/PageHeading";
import { listBooksForViewer } from "@/components/library/queries";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import type { User } from "@/lib/types";

/**
 * The all-books listing, shared by /books (./page.tsx: static and cached, no
 * query string) and /live/books (src/app/live: filtered, sorted or paged).
 */

/** English tab title of the all-books listing (see localizeTitle in src/lib/i18n/metadata.ts). */
export const BOOKS_TITLE_EN = "All children's books: stories to read and listen to";

/** English description of the all-books listing. */
export const BOOKS_DESCRIPTION_EN =
  "Every children's book in the library, free to read: illustrated stories with nikud and narration, filtered by age, category, reading time and discussion topic.";

export function booksMetadata(searchParams: RawSearchParams): Metadata {
  const query = parseLibraryQuery(searchParams);
  const filtered = hasActiveFilters(query);
  return {
    ...pageMetadata({
      title: "כל ספרי הילדים: סיפורים לקריאה ולהאזנה",
      description:
        "כל ספרי הילדים בספרייה, לקריאה בחינם: סיפורים מאוירים עם ניקוד והקראה, עם סינון לפי גיל, קטגוריה, זמן קריאה ונושא לשיחה.",
      path: routes.books(),
    }),
    // Filter combinations are endless; only the plain listing is indexed.
    robots: filtered || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export async function BooksView({ searchParams, viewer = null }: { searchParams: RawSearchParams; viewer?: User | null }) {
  // "Read" is per user: without a signed-in viewer the filter does not apply.
  const { query, listing, readIds } = await listBooksForViewer(parseLibraryQuery(searchParams), viewer);
  const shown = { ...query, page: listing.page };
  const path = routes.books();
  const scope: ListingScope = { kind: "books" };
  const listParams = toParams({ ...shown, page: undefined });
  const { locale, t: messages } = await getT();
  const t = messages.library;
  const active = describeActiveFilters(shown, locale);

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        title={t.booksTitle}
        emoji="📚"
        description={t.booksDescription}
        crumbs={[{ label: t.booksTitle }]}
        locale={locale}
      />

      <FilterForm query={shown} signedIn={!!viewer} />

      <section aria-label={t.bookList} className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="me-2 font-semibold" role="status">
            {t.bookCount(listing.total)}
          </p>
          {active.map((filter) => (
            <Chip
              key={filter.key}
              href={hrefWith(path, shown, { [filter.key]: undefined })}
              tone="primary"
              icon={filter.emoji}
              title={t.removeFilter}
            >
              {filter.label}
              <X aria-hidden="true" className="ms-1 inline size-4 align-[-2px]" />
              <span className="sr-only"> ({t.removeFilter})</span>
            </Chip>
          ))}
          {active.length > 1 ? (
            <Chip href={hrefWith(path, { sort: shown.sort, page: 1 }, {})} tone="neutral">
              {t.clearFilters}
            </Chip>
          ) : null}
        </div>

        {listing.books.length > 0 ? (
          <InfiniteBookGrid
            // A new filter or sort order starts over instead of keeping the loaded pages.
            key={listingApiUrl(scope, listParams, 1)}
            scope={scope}
            path={path}
            params={listParams}
            initialItems={toListingItems(listing.books, listing.now, readIds)}
            page={listing.page}
            pages={listing.pages}
          />
        ) : (
          <EmptyState
            icon="🔍"
            title={t.noMatchTitle}
            description={t.noMatchDescription}
            action={<ButtonLink href={routes.books()}>{t.clearFilters}</ButtonLink>}
          />
        )}
      </section>
    </main>
  );
}
