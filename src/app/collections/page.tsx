import type { Metadata } from "next";
import { CollectionCard } from "@/components/library/CollectionCard";
import { PageHeading } from "@/components/library/PageHeading";
import { listCollectionsWithBooks } from "@/components/library/queries";
import { isInSeason } from "@/components/library/seasons";
import { ButtonLink, EmptyState } from "@/components/ui";
import { libraryMessages } from "@/lib/i18n/library";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

const HEBREW_METADATA: Metadata = pageMetadata({
  title: "אוספי סיפורי ילדים",
  description:
    "אוספי סיפורי ילדים ערוכים: לעונות השנה, לחגים ולרגעים מיוחדים כמו השעה שלפני השינה. ספרים מאוירים עם ניקוד והקראה, בחינם.",
  path: routes.collections(),
});

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Collections of children's stories");
}

export default async function CollectionsPage() {
  const today = new Date();
  const collections = await listCollectionsWithBooks(today);
  const locale = await getLocale();
  const t = libraryMessages(locale).collections;

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        title={t.title}
        emoji="🧺"
        description={t.description}
        crumbs={[{ label: t.crumb }]}
        locale={locale}
      />
      {collections.length === 0 ? (
        <EmptyState
          icon="🧺"
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={<ButtonLink href={routes.books()}>{t.allBooks}</ButtonLink>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map(({ collection, books }) => (
            <li key={collection.id}>
              <CollectionCard collection={collection} books={books} inSeason={isInSeason(collection, today)} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
