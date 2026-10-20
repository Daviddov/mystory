import type { Metadata } from "next";
import { CollectionCard } from "@/components/library/CollectionCard";
import { PageHeading } from "@/components/library/PageHeading";
import { listCollectionsWithBooks } from "@/components/library/queries";
import { isInSeason } from "@/components/library/seasons";
import { ButtonLink, EmptyState } from "@/components/ui";
import { routes } from "@/lib/routes";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "אוספים",
  description: "אוספי ספרים ערוכים לילדים: לעונות השנה, לחגים ולרגעים מיוחדים כמו השעה שלפני השינה.",
  alternates: { canonical: routes.collections() },
};

export default async function CollectionsPage() {
  const today = new Date();
  const collections = await listCollectionsWithBooks(today);

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        title="אוספים"
        emoji="🧺"
        description="ספרים שנבחרו ביד וסודרו יחד: לעונות השנה, לחגים ולרגעים מיוחדים."
        crumbs={[{ label: "אוספים" }]}
      />
      {collections.length === 0 ? (
        <EmptyState
          icon="🧺"
          title="עוד אין אוספים"
          description="אוספים חדשים יופיעו כאן. בינתיים אפשר לעיין בכל הספרים."
          action={<ButtonLink href={routes.books()}>לכל הספרים</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map(({ collection, books }) => (
            <li key={collection.id}>
              <CollectionCard collection={collection} books={books} inSeason={isInSeason(collection, today)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
