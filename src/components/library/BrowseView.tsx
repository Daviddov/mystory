import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { BookGrid } from "@/components/BookGrid";
import { JsonLd } from "@/components/JsonLd";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import type { BookFilter } from "@/lib/repo/types";
import { routes } from "@/lib/routes";
import { bookListJsonLd } from "@/lib/seo";
import { AGE_GROUP_INFO } from "@/lib/taxonomy";
import { bookCountLabel, hrefWith, parseLibraryQuery, type LibraryQuery, type RawSearchParams } from "./filters";
import { PageHeading, type Crumb } from "./PageHeading";
import { Pagination } from "./Pagination";
import { listLibraryBooks } from "./queries";
import { isNewBook } from "./recommend";
import { SortChips } from "./SortChips";

export interface BrowseSibling {
  label: string;
  href: string;
  emoji?: string;
  selected?: boolean;
}

export interface BrowseViewProps {
  /** Path of this page without the query string, e.g. routes.category("animals"). */
  path: string;
  searchParams: RawSearchParams;
  /** The filter this page fixes (category, age group, ...). */
  base: BookFilter;
  title: ReactNode;
  emoji?: string;
  eyebrow?: string;
  description?: ReactNode;
  crumbs: Crumb[];
  /** Other pages of the same kind (the other categories, the other age groups). */
  siblings?: BrowseSibling[];
  siblingsLabel?: string;
  /** Show age-group chips as a second filter. Off on the age pages themselves. */
  ageFilter?: boolean;
  /** Link to /books with this page's filter preselected, for combining more filters. */
  refineHref?: string;
  emptyTitle?: string;
  /** Extra content between the heading and the list. */
  children?: ReactNode;
}

/**
 * The body of every "browse by X" page: heading, sibling links, optional age
 * chips, sort order, the grid and the pager. Async Server Component.
 */
export async function BrowseView({
  path,
  searchParams,
  base,
  title,
  emoji,
  eyebrow,
  description,
  crumbs,
  siblings,
  siblingsLabel,
  ageFilter = true,
  refineHref,
  emptyTitle = "עוד אין כאן ספרים",
  children,
}: BrowseViewProps) {
  const parsed = parseLibraryQuery(searchParams);
  // Only sort, page and (optionally) age are honoured here; the rest belongs to /books.
  const query: LibraryQuery = {
    sort: parsed.sort,
    page: parsed.page,
    age: ageFilter ? parsed.age : undefined,
  };
  const listing = await listLibraryBooks(query, base);
  const shown: LibraryQuery = { ...query, page: listing.page };

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      {listing.books.length > 0 ? <JsonLd data={bookListJsonLd(listing.books)} /> : null}
      <PageHeading title={title} emoji={emoji} eyebrow={eyebrow} description={description} crumbs={crumbs} />

      {siblings && siblings.length > 0 ? (
        <nav aria-label={siblingsLabel ?? "עוד אפשרויות"}>
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {siblings.map((sibling) => (
              <li key={sibling.href} className="shrink-0">
                <Chip href={sibling.href} icon={sibling.emoji} selected={sibling.selected}>
                  {sibling.label}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {children}

      <section aria-label="רשימת הספרים" className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          {ageFilter ? (
            <nav aria-label="סינון לפי גיל" className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted">גיל:</span>
              <Chip href={hrefWith(path, shown, { age: undefined })} selected={!shown.age}>
                כל הגילים
              </Chip>
              {AGE_GROUP_INFO.map((age) => (
                <Chip
                  key={age.slug}
                  href={hrefWith(path, shown, { age: age.slug })}
                  icon={age.emoji}
                  selected={shown.age === age.slug}
                >
                  {age.shortLabel}
                </Chip>
              ))}
            </nav>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SortChips current={shown.sort} hrefFor={(sort) => hrefWith(path, shown, { sort })} />
            {refineHref ? (
              <ButtonLink href={refineHref} variant="outline" size="sm">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                עוד סינונים
              </ButtonLink>
            ) : null}
          </div>
          <p className="text-muted" role="status">
            {bookCountLabel(listing.total)}
          </p>
        </div>

        <BookGrid
          books={listing.books}
          cardProps={(book) => (isNewBook(book, listing.now) ? { badge: "חדש" } : {})}
          empty={
            <EmptyState
              title={emptyTitle}
              description={
                shown.age
                  ? "אין ספרים לגיל שבחרתם. נסו גיל אחר או הציגו את כל הגילים."
                  : "ספרים חדשים מתווספים כל הזמן. בינתיים אפשר לעיין בכל הספרייה."
              }
              action={
                shown.age ? (
                  <ButtonLink href={hrefWith(path, shown, { age: undefined })}>כל הגילים</ButtonLink>
                ) : (
                  <ButtonLink href={routes.books()}>לכל הספרים</ButtonLink>
                )
              }
            />
          }
        />

        <Pagination
          page={listing.page}
          pages={listing.pages}
          hrefFor={(page) => hrefWith(path, shown, { page })}
        />
      </section>
    </main>
  );
}
