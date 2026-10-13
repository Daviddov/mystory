import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { BookGrid } from "@/components/BookGrid";
import { bookCountLabel } from "@/components/library/filters";
import { PageHeading } from "@/components/library/PageHeading";
import { getCollectionWithBooks } from "@/components/library/queries";
import { seasonInfo } from "@/components/library/seasons";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { SLUG_PATTERN } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function load(slug: string) {
  if (!SLUG_PATTERN.test(slug)) return null;
  return getCollectionWithBooks(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return { title: "האוסף לא נמצא", robots: { index: false } };
  const { collection, books } = found;
  const cover = books[0] ? mediaUrl(books[0].coverImage, books[0].updatedAt) : "";
  const description = collection.description || `אוסף ספרים לילדים: ${collection.title}.`;
  return {
    title: `${collection.title} (אוסף)`,
    description,
    alternates: { canonical: routes.collection(collection.slug) },
    openGraph: {
      title: collection.title,
      description,
      type: "website",
      locale: "he_IL",
      url: routes.collection(collection.slug),
      images: cover ? [{ url: cover }] : undefined,
    },
  };
}

export default async function CollectionPage({ params }: Props) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { collection, books } = found;
  const season = seasonInfo(collection.season);

  return (
    <main className="container-page flex flex-col gap-8 py-8 sm:py-10">
      <PageHeading
        eyebrow="אוסף"
        title={collection.title}
        emoji="🧺"
        description={collection.description || undefined}
        crumbs={[{ label: "אוספים", href: routes.collections() }, { label: collection.title }]}
      >
        <div className="flex flex-wrap items-center gap-3">
          {season ? (
            <Chip icon={season.emoji} tone="secondary">
              {season.label}
            </Chip>
          ) : null}
          <p className="text-muted">{bookCountLabel(books.length)}</p>
        </div>
        {books[0] ? (
          <div>
            <ButtonLink href={routes.read(books[0].slug)} size="lg">
              <BookOpen aria-hidden="true" />
              מתחילים מהספר הראשון
            </ButtonLink>
          </div>
        ) : null}
      </PageHeading>

      <BookGrid
        books={books}
        empty={
          <EmptyState
            icon="🧺"
            title="האוסף הזה עוד ריק"
            description="עוד לא נוספו אליו ספרים שפורסמו."
            action={<ButtonLink href={routes.collections()}>לכל האוספים</ButtonLink>}
          />
        }
      />
    </main>
  );
}
