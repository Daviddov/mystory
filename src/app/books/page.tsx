import type { Metadata } from "next";
import { X } from "lucide-react";
import { BookGrid } from "@/components/BookGrid";
import { FilterForm } from "@/components/library/FilterForm";
import {
  bookCountLabel,
  describeActiveFilters,
  hasActiveFilters,
  hrefWith,
  parseLibraryQuery,
  type RawSearchParams,
} from "@/components/library/filters";
import { PageHeading } from "@/components/library/PageHeading";
import { Pagination } from "@/components/library/Pagination";
import { listLibraryBooks } from "@/components/library/queries";
import { isNewBook } from "@/components/library/recommend";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseLibraryQuery(await searchParams);
  const filtered = hasActiveFilters(query);
  return {
    title: "כל הספרים",
    description: "כל ספרי הילדים בספרייה, עם סינון לפי גיל, קטגוריה, זמן קריאה ונושא לשיחה.",
    alternates: { canonical: routes.books() },
    // Filter combinations are endless; only the plain listing is indexed.
    robots: filtered || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function BooksPage({ searchParams }: Props) {
  const query = parseLibraryQuery(await searchParams);
  const listing = await listLibraryBooks(query);
  const shown = { ...query, page: listing.page };
  const active = describeActiveFilters(shown);
  const path = routes.books();

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        title="כל הספרים"
        emoji="📚"
        description="אפשר לשלב כמה סינונים יחד: גיל, קטגוריה, זמן קריאה ונושא לשיחה."
        crumbs={[{ label: "כל הספרים" }]}
      />

      <FilterForm query={shown} />

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

        <BookGrid
          books={listing.books}
          cardProps={(book) => (isNewBook(book, listing.now) ? { badge: "חדש" } : {})}
          empty={
            <EmptyState
              icon="🔍"
              title="לא מצאנו ספרים שמתאימים לכל הסינונים"
              description="נסו להסיר אחד מהסינונים, או התחילו מחדש."
              action={<ButtonLink href={routes.books()}>ניקוי כל הסינונים</ButtonLink>}
            />
          }
        />

        <Pagination page={listing.page} pages={listing.pages} hrefFor={(page) => hrefWith(path, shown, { page })} />
      </section>
    </main>
  );
}
