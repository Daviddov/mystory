import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BookRow } from "@/components/BookRow";
import { CollectionCard } from "@/components/library/CollectionCard";
import { HeroBook } from "@/components/library/HeroBook";
import { getHomeData } from "@/components/library/queries";
import { isNewBook } from "@/components/library/recommend";
import { SearchForm } from "@/components/library/SearchForm";
import { isInSeason } from "@/components/library/seasons";
import { AgeTiles, TimeTiles } from "@/components/library/Tiles";
import { JsonLd } from "@/components/JsonLd";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { routes } from "@/lib/routes";
import { siteJsonLd } from "@/lib/seo";
import { THEMES } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "סיפורים לילדים בעברית לקרוא ולשמוע: ספרים מאוירים עם ניקוד והקראה, לפי גיל, נושא וזמן קריאה. בחינם, בלי הרשמה ובלי פרסומות.";

export const metadata: Metadata = {
  title: { absolute: "הסיפור שלי: סיפורים לילדים לקרוא ולשמוע" },
  description: DESCRIPTION,
  alternates: { canonical: routes.home() },
  openGraph: {
    title: "הסיפור שלי: סיפורים לילדים לקרוא ולשמוע",
    description: DESCRIPTION,
    type: "website",
    locale: "he_IL",
    url: routes.home(),
  },
};

export default async function HomePage() {
  const data = await getHomeData();
  const today = new Date(data.now);

  if (data.totalBooks === 0) {
    return (
      <main className="container-page flex flex-col gap-8 py-10">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">סיפורים לקרוא ולשמוע</h1>
        <EmptyState
          title="הספרייה עוד ריקה"
          description="עוד לא פורסמו ספרים. אפשר ליצור את הספר הראשון בסטודיו."
          action={<ButtonLink href={routes.studio()}>לסטודיו</ButtonLink>}
        />
      </main>
    );
  }

  return (
    <main className="container-page flex flex-col gap-12 py-6 sm:gap-14 sm:py-10">
      <JsonLd data={siteJsonLd()} />
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">סיפורים לקרוא ולשמוע</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
            בוחרים ספר, מדפדפים וקוראים יחד. בלי הרשמה ובלי פרסומות.
          </p>
        </div>
        <SearchForm id="home-search" className="max-w-2xl" />
      </section>

      {data.bookOfTheWeek ? (
        <HeroBook book={data.bookOfTheWeek} label={data.bookOfTheWeekIsChosen ? "ספר השבוע" : "הספר הכי נקרא"} />
      ) : null}

      <AgeTiles />

      <BookRow
        title="חדש בספרייה"
        emoji="✨"
        books={data.newest}
        href={routes.books({ sort: "new" })}
        cardProps={(book, index) => ({
          badge: isNewBook(book, data.now) ? "חדש" : undefined,
          priority: index < 4,
        })}
      />

      <BookRow
        title="הכי פופולריים"
        emoji="🏆"
        books={data.popular}
        href={routes.books({ sort: "popular" })}
      />

      <TimeTiles />

      {data.collections.length > 0 ? (
        <section aria-labelledby="home-collections-title" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <h2 id="home-collections-title" className="text-2xl font-bold sm:text-3xl">
              <span aria-hidden="true">🧺 </span>
              אוספים לעונה ולחגים
            </h2>
            <Link
              href={routes.collections()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 font-semibold text-secondary hover:bg-surface-2"
            >
              לכל האוספים
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.collections.slice(0, 6).map(({ collection, books }) => (
              <li key={collection.id}>
                <CollectionCard collection={collection} books={books} inSeason={isInSeason(collection, today)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.shelves.map((shelf) => (
        <BookRow
          key={shelf.category.slug}
          title={shelf.category.label}
          emoji={shelf.category.emoji}
          books={shelf.books}
          href={routes.category(shelf.category.slug)}
          hrefLabel={`כל ספרי ${shelf.category.label}`}
        />
      ))}

      <section aria-labelledby="home-themes-title" className="flex flex-col gap-4">
        <h2 id="home-themes-title" className="text-2xl font-bold sm:text-3xl">
          <span aria-hidden="true">💬 </span>
          על מה נדבר אחרי הסיפור?
        </h2>
        <ul className="flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <li key={theme.slug}>
              <Chip href={routes.theme(theme.slug)} icon={theme.emoji} tone="secondary">
                {theme.label}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-center">
        <ButtonLink href={routes.books()} variant="secondary" size="lg">
          לכל הספרים בספרייה
        </ButtonLink>
      </div>
    </main>
  );
}
