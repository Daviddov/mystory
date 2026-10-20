import type { Metadata } from "next";
import { BookRow } from "@/components/BookRow";
import { CollectionCard } from "@/components/library/CollectionCard";
import { ContinueReading } from "@/components/library/ContinueReading";
import { HeroBook } from "@/components/library/HeroBook";
import { Greeting } from "@/components/library/Greeting";
import { getHomeData } from "@/components/library/queries";
import { isNewBook } from "@/components/library/recommend";
import { SearchForm } from "@/components/library/SearchForm";
import { isInSeason } from "@/components/library/seasons";
import { SectionTitle } from "@/components/library/SectionTitle";
import { AgeTiles, TimeTiles } from "@/components/library/Tiles";
import { JsonLd } from "@/components/JsonLd";
import { ButtonLink, Chip, EmptyState } from "@/components/ui";
import { toPublicBook } from "@/lib/public-book";
import { routes } from "@/lib/routes";
import { siteJsonLd } from "@/lib/seo";
import { THEMES } from "@/lib/taxonomy";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

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

  const readableBooks = [
    ...new Map(
      [data.bookOfTheWeek, ...data.newest, ...data.popular, ...data.shelves.flatMap((shelf) => shelf.books)]
        .filter((book) => book !== null)
        .map((book) => [book.id, toPublicBook(book)]),
    ).values(),
  ];

  return (
    <main className="container-page flex flex-col gap-12 py-6 sm:gap-16 sm:py-10">
      <JsonLd data={siteJsonLd()} />
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-surface px-5 py-8 shadow-card sm:px-10 sm:py-12">
        <div aria-hidden="true" className="hero-washes -z-10" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden select-none sm:block">
          <span className="float-soft absolute end-[6%] top-[14%] text-6xl">📚</span>
          <span className="float-soft absolute bottom-[14%] end-[18%] text-5xl [animation-delay:-2s]">🦉</span>
          <span className="float-soft absolute end-[30%] top-[10%] text-4xl [animation-delay:-3.5s]">⭐</span>
        </div>
        <div className="flex max-w-2xl flex-col gap-5">
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-surface/80 px-4 py-1.5 font-semibold shadow-card backdrop-blur">
            <Greeting />
          </p>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
              סיפורים לקרוא <span className="text-primary">ולשמוע</span>
            </h1>
            <p className="text-lg leading-relaxed text-foreground/75 sm:text-xl">
              בוחרים ספר, מדפדפים וקוראים יחד. בלי הרשמה ובלי פרסומות.
            </p>
          </div>
          <SearchForm id="home-search" />
        </div>
      </section>

      <ContinueReading books={readableBooks} />

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

      <BookRow title="הכי פופולריים" emoji="🏆" books={data.popular} href={routes.books({ sort: "popular" })} />

      <TimeTiles />

      {data.collections.length > 0 ? (
        <section aria-labelledby="home-collections-title" className="flex flex-col gap-4">
          <SectionTitle id="home-collections-title" emoji="🧺" href={routes.collections()} hrefLabel="לכל האוספים">
            אוספים לעונה ולחגים
          </SectionTitle>
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
        <SectionTitle id="home-themes-title" emoji="💬">
          על מה נדבר אחרי הסיפור?
        </SectionTitle>
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
