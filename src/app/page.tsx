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
import { getMessages, taxonomyText } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { toPublicBook } from "@/lib/public-book";
import { routes } from "@/lib/routes";
import { pageMetadata, SITE_TITLE, siteJsonLd } from "@/lib/seo";
import { THEMES } from "@/lib/taxonomy";
import { SITE_DESCRIPTION_EN, localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

const TITLE = "סיפורי ילדים לקריאה ולהאזנה, עם ניקוד ובחינם | הסיפור שלי";
const DESCRIPTION =
  "סיפורי ילדים לקריאה ולהאזנה בעברית: ספרים מאוירים עם ניקוד והקראה, סיפורים לפני השינה ולגיל הרך, לפי גיל, נושא וזמן קריאה. בחינם, בלי הרשמה ובלי פרסומות.";

const page = pageMetadata({ title: TITLE, description: DESCRIPTION, path: routes.home(), shareTitle: SITE_TITLE });
const HEBREW_METADATA: Metadata = { ...page, title: { absolute: TITLE } };

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, { absolute: "Children's stories to read and listen to, with nikud, free | My Story" }, SITE_DESCRIPTION_EN);
}

export default async function HomePage() {
  const data = await getHomeData();
  const today = new Date(data.now);
  // Hebrew in the static page; English visitors get the live twin (src/proxy.ts).
  const locale = await getLocale();
  const t = getMessages(locale).home;

  if (data.totalBooks === 0) {
    return (
      <main className="container-page flex flex-col gap-8 py-10">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">{t.title}</h1>
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={<ButtonLink href={routes.studio()}>{t.toStudio}</ButtonLink>}
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
              {t.titleStart}
              <span className="text-primary">{t.titleEnd}</span>
            </h1>
            <p className="text-lg leading-relaxed text-foreground/75 sm:text-xl">{t.lead}</p>
          </div>
          <SearchForm id="home-search" locale={locale} />
        </div>
      </section>

      <ContinueReading books={readableBooks} />

      {data.bookOfTheWeek ? (
        <HeroBook
          book={data.bookOfTheWeek}
          label={data.bookOfTheWeekIsChosen ? t.bookOfTheWeek : t.mostRead}
          locale={locale}
        />
      ) : null}

      <AgeTiles locale={locale} />

      <BookRow
        title={t.newest}
        emoji="✨"
        books={data.newest}
        href={routes.books({ sort: "new" })}
        locale={locale}
        cardProps={(book, index) => ({
          badge: isNewBook(book, data.now) ? getMessages(locale).book.new : undefined,
          priority: index < 4,
        })}
      />

      <BookRow
        title={t.popular}
        emoji="🏆"
        books={data.popular}
        href={routes.books({ sort: "popular" })}
        locale={locale}
      />

      <TimeTiles locale={locale} />

      {data.collections.length > 0 ? (
        <section aria-labelledby="home-collections-title" className="flex flex-col gap-4">
          <SectionTitle id="home-collections-title" emoji="🧺" href={routes.collections()} hrefLabel={t.allCollections}>
            {t.collections}
          </SectionTitle>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.collections.slice(0, 6).map(({ collection, books }) => (
              <li key={collection.id}>
                <CollectionCard
                  collection={collection}
                  books={books}
                  inSeason={isInSeason(collection, today)}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.shelves.map((shelf) => {
        const { label } = taxonomyText(locale, "category", shelf.category.slug, shelf.category);
        return (
          <BookRow
            key={shelf.category.slug}
            title={label}
            emoji={shelf.category.emoji}
            books={shelf.books}
            href={routes.category(shelf.category.slug)}
            hrefLabel={t.allInCategory(label)}
            locale={locale}
          />
        );
      })}

      <section aria-labelledby="home-themes-title" className="flex flex-col gap-4">
        <SectionTitle id="home-themes-title" emoji="💬">
          {t.themesTitle}
        </SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <li key={theme.slug}>
              <Chip href={routes.theme(theme.slug)} icon={theme.emoji} tone="secondary">
                {taxonomyText(locale, "theme", theme.slug, theme).label}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-center">
        <ButtonLink href={routes.books()} variant="secondary" size="lg">
          {t.allBooksButton}
        </ButtonLink>
      </div>
    </main>
  );
}
