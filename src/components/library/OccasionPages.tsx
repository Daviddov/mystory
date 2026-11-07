/**
 * The parasha and holiday landing pages (/parasha/noach, /holidays/hanukkah)
 * and their two index pages. Data and wording live in lib/occasions.ts.
 * Server Components.
 */
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { cache } from "react";
import { cn } from "@/lib/cn";
import { TORAH_BOOKS } from "@/lib/generation/parasha";
import { libraryMessages, occasionIntroEn, occasionNameEn, torahBookEn } from "@/lib/i18n/library";
import type { Locale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import {
  HOLIDAYS,
  getOccasion,
  occasionBookIds,
  occasionDescription,
  occasionHref,
  occasionIndexable,
  occasionIntro,
  occasionLabel,
  occasionSearchTitle,
  parashotByBook,
  type Occasion,
  type OccasionKind,
} from "@/lib/occasions";
import { routes } from "@/lib/routes";
import { pageMetadata, plainText } from "@/lib/seo";
import { BrowseView } from "./BrowseView";
import type { RawSearchParams } from "./filters";
import { PageHeading, type Crumb } from "./PageHeading";
import { listOccasionBookIds } from "./queries";
import { currentSeasons } from "./seasons";
import { SectionTitle } from "./SectionTitle";

/** The bare name in the interface language: "נח" / "Noach". */
function occasionName(locale: Locale, occasion: Occasion): string {
  return locale === "he" ? occasion.name : occasionNameEn(occasion.kind, occasion.slug);
}

/** The name with its prefix in the interface language: "פרשת נח" / "Parashat Noach". */
function occasionLabelText(locale: Locale, occasion: Occasion): string {
  if (locale === "he") return occasionLabel(occasion);
  const name = occasionName(locale, occasion);
  return occasion.kind === "parasha" ? `Parashat ${name}` : name;
}

/** One read per request, shared by generateMetadata and the page. */
const occasionBooks = cache(listOccasionBookIds);

const INDEX = {
  parasha: {
    href: routes.parashot,
    crumb: "פרשת השבוע",
    title: "סיפורי פרשת השבוע לילדים: סיפור לכל פרשה, מבראשית ועד וזאת הברכה",
    description:
      "סיפורי פרשת השבוע לילדים, סיפור לכל פרשה בתורה: סיפורים מאוירים עם ניקוד והקראה, לקריאה לפני שבת ולשיחה בשולחן השבת. בחינם.",
    emoji: "📜",
  },
  holiday: {
    href: routes.holidays,
    crumb: "חגים",
    title: "סיפורי חגים לילדים: סיפורים לשבת ולחגי ישראל",
    description:
      "סיפורי חגים לילדים: סיפורים מאוירים לשבת, לראש השנה, סוכות, חנוכה, ט״ו בשבט, פורים, פסח ושבועות. עם ניקוד והקראה, בחינם.",
    emoji: "🕯️",
  },
} as const;

// --- One parasha or holiday ----------------------------------------------------

export async function occasionMetadata(kind: OccasionKind, slug: string): Promise<Metadata> {
  const occasion = getOccasion(kind, slug);
  if (!occasion) return { title: "הדף לא נמצא", robots: { index: false } };
  const count = occasionBookIds(await occasionBooks(), occasion).length;
  return {
    ...pageMetadata({
      title: plainText(occasionSearchTitle(occasion)),
      description: plainText(occasionDescription(occasion), 160),
      path: occasionHref(occasion),
    }),
    // Until a book is published for it, the page is a thin "coming soon": keep it out of the index.
    ...(occasionIndexable(count) ? {} : { robots: { index: false, follow: true } }),
  };
}

export async function OccasionView({ occasion, searchParams }: { occasion: Occasion; searchParams: RawSearchParams }) {
  const ids = occasionBookIds(await occasionBooks(), occasion);
  const locale = await getLocale();
  const index = INDEX[occasion.kind];
  const t = libraryMessages(locale).occasions[occasion.kind];
  const name = occasionName(locale, occasion);
  const label = occasionLabelText(locale, occasion);
  const crumbs: Crumb[] = [{ label: t.crumb, href: index.href() }, { label }];

  // Parashot: the other portions of the same book of the Torah. Holidays: all holidays.
  const siblings =
    occasion.kind === "parasha"
      ? (parashotByBook().find((group) => group.book === occasion.book)?.parashot ?? [])
      : HOLIDAYS;

  return (
    <BrowseView
      path={occasionHref(occasion)}
      searchParams={searchParams}
      base={{ ids }}
      scope={{ kind: occasion.kind, value: occasion.slug }}
      eyebrow={t.eyebrow}
      title={t.pageTitle(name)}
      emoji={occasion.emoji}
      description={locale === "he" ? occasionIntro(occasion) : occasionIntroEn(occasion.kind, occasion.slug, occasion.book)}
      crumbs={crumbs}
      siblingsLabel={t.siblings}
      siblings={siblings.map((item) => ({
        label: occasionName(locale, item),
        href: occasionHref(item),
        emoji: occasion.kind === "holiday" ? item.emoji : undefined,
        selected: item.slug === occasion.slug,
      }))}
      refineHref={routes.books({ category: occasion.kind === "parasha" ? "parasha" : "judaism" })}
      emptyTitle={t.empty(name)}
    >
      <p>
        <Link
          href={index.href()}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t.backToIndex}
        </Link>
      </p>
    </BrowseView>
  );
}

// --- Index pages -------------------------------------------------------------------

export function occasionIndexMetadata(kind: OccasionKind): Metadata {
  const index = INDEX[kind];
  return pageMetadata({ title: index.title, description: index.description, path: index.href() });
}

function OccasionLink({
  occasion,
  count,
  highlight,
  locale,
}: {
  occasion: Occasion;
  count: number;
  highlight?: boolean;
  locale: Locale;
}) {
  const t = libraryMessages(locale).occasions;
  return (
    <Link
      href={occasionHref(occasion)}
      className={cn(
        "flex min-h-touch items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-card ring-1 ring-border/70",
        "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        highlight ? "bg-primary-soft" : "bg-surface",
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true">{occasion.emoji}</span>
        {occasionLabelText(locale, occasion)}
      </span>
      <span className="text-sm text-muted">
        {highlight ? t.now : ""}
        {t.count(count)}
      </span>
    </Link>
  );
}

export async function OccasionIndexView({ kind }: { kind: OccasionKind }) {
  const grouped = await occasionBooks();
  const locale = await getLocale();
  const all = libraryMessages(locale).occasions;
  const t = all[kind];
  const index = INDEX[kind];
  const other = INDEX[kind === "parasha" ? "holiday" : "parasha"];
  const inSeason = new Set(currentSeasons(new Date()));

  const groups =
    kind === "parasha"
      ? parashotByBook().map((group) => ({
          id: group.book,
          title: all.torahBook(locale === "he" ? TORAH_BOOKS[group.book] : torahBookEn(group.book)),
          items: group.parashot,
        }))
      : [{ id: "holidays", title: all.holidaysGroup, items: [...HOLIDAYS] }];

  return (
    <main className="container-page flex flex-col gap-10 py-8 sm:py-10">
      <PageHeading
        title={t.title}
        emoji={index.emoji}
        description={t.description}
        crumbs={[{ label: all.allBooksCrumb, href: routes.books() }, { label: t.crumb }]}
        locale={locale}
      >
        <p>
          <Link href={other.href()} className="font-semibold text-primary underline-offset-4 hover:underline">
            {t.otherIndex}
          </Link>
        </p>
      </PageHeading>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`occasions-${group.id}`} className="flex flex-col gap-4">
          <SectionTitle id={`occasions-${group.id}`}>{group.title}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((occasion) => (
              <li key={occasion.slug}>
                <OccasionLink
                  occasion={occasion}
                  count={occasionBookIds(grouped, occasion).length}
                  highlight={occasion.kind === "holiday" && inSeason.has(occasion.slug)}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
