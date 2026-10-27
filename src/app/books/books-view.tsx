import type { Metadata } from "next";
import { X } from "lucide-react";
import { FilterForm } from "@/components/library/FilterForm";
import {
  bookCountLabel,
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
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import type { User } from "@/lib/types";

/**
 * The all-books listing, shared by /books (./page.tsx: static and cached, no
 * query string) and /live/books (src/app/live: filtered, sorted or paged).
 */

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
  const active = describeActiveFilters(shown);
  const path = routes.books();
  const scope: ListingScope = { kind: "books" };
  const listParams = toParams({ ...shown, page: undefined });

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        title="כל הספרים"
        emoji="📚"
        description="אפשר לשלב כמה סינונים יחד: גיל, קטגוריה, זמן קריאה ונושא לשיחה."
        crumbs={[{ label: "כל הספרים" }]}
      />

      <FilterForm query={shown} signedIn={!!viewer} />

      <section aria-label="רשימת הספרים" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="me-2 font-semibold" role="status">
            {bookCountLabel(listing.total)}
          </p>
          {active.map((filter) => (
            <Chip
              key={filter.key}
              href={hrefWith(path, shown, { [filter.key]: undefined })}
              tone="primary"
              icon={filter.emoji}
              title="הסרת הסינון"
            >
              {filter.label}
              <X aria-hidden="true" className="ms-1 inline size-4 align-[-2px]" />
              <span className="sr-only"> (הסרת הסינון)</span>
            </Chip>
          ))}
          {active.length > 1 ? (
            <Chip href={hrefWith(path, { sort: shown.sort, page: 1 }, {})} tone="neutral">
              ניקוי כל הסינונים
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
            title="לא מצאנו ספרים שמתאימים לכל הסינונים"
            description="נסו להסיר אחד מהסינונים, או התחילו מחדש."
            action={<ButtonLink href={routes.books()}>ניקוי כל הסינונים</ButtonLink>}
          />
        )}
      </section>
    </main>
  );
}
