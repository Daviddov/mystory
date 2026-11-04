import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { BookGrid } from "@/components/BookGrid";
import { PageHeading } from "@/components/library/PageHeading";
import { getCollectionWithBooks } from "@/components/library/queries";
import { normalizeSeason, seasonInfo } from "@/components/library/seasons";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { libraryMessages } from "@/lib/i18n/library";
import { getMessages, taxonomyText } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { pageMetadata, plainText } from "@/lib/seo";
import { SLUG_PATTERN } from "@/lib/types";
import { localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

/** Each collection is rendered on its first visit, then cached. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface Props {
  params: Promise<{ slug: string }>;
}

async function load(slug: string) {
  if (!SLUG_PATTERN.test(slug)) return null;
  return getCollectionWithBooks(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return localizeTitle({ title: "האוסף לא נמצא", robots: { index: false } });
  const { collection, books } = found;
  const cover = books[0] ? mediaUrl(books[0].coverImage, books[0].updatedAt) : "";
  const name = plainText(collection.title);
  const intro = plainText(collection.description, 110).replace(/[.…!?\s]+$/, "");
  const description = intro
    ? `${intro}. אוסף סיפורי ילדים עם ניקוד והקראה, בחינם.`
    : `${name}: אוסף סיפורי ילדים מאוירים עם ניקוד והקראה, לקריאה ולהאזנה בחינם.`;
  const page = pageMetadata({
    title: `${name}: אוסף סיפורים לילדים`,
    shareTitle: name,
    description,
    path: routes.collection(collection.slug),
  });
  return localizeTitle({
    ...page,
    openGraph: { ...page.openGraph, images: cover ? [{ url: cover }] : undefined },
    // An empty collection is left out of the sitemap too: nothing to index until a book is added.
    robots: books.length > 0 ? undefined : { index: false, follow: true },
  }, `${name}: a collection of children's stories`);
}

export default async function CollectionPage({ params }: Props) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { collection, books } = found;
  const season = seasonInfo(collection.season);
  const locale = await getLocale();
  const t = libraryMessages(locale).collection;
  const seasonLabel = season
    ? taxonomyText(locale, "season", normalizeSeason(collection.season) ?? "", season).label
    : undefined;

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        eyebrow={t.eyebrow}
        // Collection titles and descriptions are content, written by the editors: never translated.
        title={<span dir="auto">{collection.title}</span>}
        emoji="🧺"
        description={collection.description ? <span dir="auto">{collection.description}</span> : undefined}
        crumbs={[
          { label: libraryMessages(locale).collections.crumb, href: routes.collections() },
          { label: collection.title },
        ]}
        locale={locale}
      >
        <div className="flex flex-wrap items-center gap-3">
          {season ? (
            <Chip icon={season.emoji} tone="secondary">
              {seasonLabel}
            </Chip>
          ) : null}
          <p className="text-muted">{getMessages(locale).library.bookCount(books.length)}</p>
        </div>
        {books[0] ? (
          <div>
            <ButtonLink href={routes.read(books[0].slug)} size="lg">
              <BookOpen aria-hidden="true" />
              {t.startFirst}
            </ButtonLink>
          </div>
        ) : null}
      </PageHeading>

      <BookGrid
        books={books}
        locale={locale}
        empty={
          <EmptyState
            icon="🧺"
            title={t.emptyTitle}
            description={t.emptyDescription}
            action={<ButtonLink href={routes.collections()}>{t.allCollections}</ButtonLink>}
          />
        }
      />
    </main>
  );
}
