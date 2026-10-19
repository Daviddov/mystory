/**
 * The parasha and holiday landing pages (/parasha/noach, /holidays/hanukkah)
 * and their two index pages. Data and wording live in lib/occasions.ts.
 * Server Components.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { cn } from "@/lib/cn";
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
import { plainText } from "@/lib/seo";
import { BrowseView } from "./BrowseView";
import type { RawSearchParams } from "./filters";
import { PageHeading, type Crumb } from "./PageHeading";
import { listOccasionBookIds } from "./queries";
import { currentSeasons } from "./seasons";
import { SectionTitle } from "./SectionTitle";

/** One read per request, shared by generateMetadata and the page. */
const occasionBooks = cache(listOccasionBookIds);

const INDEX = {
  parasha: {
    href: routes.parashot,
    crumb: "פרשת השבוע",
    title: "סיפור לכל פרשת שבוע לילדים, מבראשית ועד וזאת הברכה",
    description:
      "סיפור לכל פרשה בתורה, מבראשית ועד וזאת הברכה: סיפורים מאוירים לילדים עם ניקוד והקראה, לקריאה לפני שבת ולשיחה בשולחן השבת. בחינם.",
    emoji: "📜",
  },
  holiday: {
    href: routes.holidays,
    crumb: "חגים",
    title: "סיפורים לחגי ישראל ולשבת לילדים",
    description:
      "סיפורים מאוירים לילדים לשבת ולחגים: ראש השנה, סוכות, חנוכה, ט״ו בשבט, פורים, פסח ושבועות. עם ניקוד והקראה, בחינם.",
    emoji: "🕯️",
  },
} as const;

// --- One parasha or holiday ----------------------------------------------------

export async function occasionMetadata(kind: OccasionKind, slug: string): Promise<Metadata> {
  const occasion = getOccasion(kind, slug);
  if (!occasion) return { title: "הדף לא נמצא", robots: { index: false } };
  const count = occasionBookIds(await occasionBooks(), occasion).length;
  return {
    title: plainText(occasionSearchTitle(occasion)),
    description: plainText(occasionDescription(occasion), 160),
    alternates: { canonical: occasionHref(occasion) },
    // Until a book is published for it, the page is a thin "coming soon": keep it out of the index.
    ...(occasionIndexable(count) ? {} : { robots: { index: false, follow: true } }),
  };
}

export async function OccasionView({ occasion, searchParams }: { occasion: Occasion; searchParams: RawSearchParams }) {
  const ids = occasionBookIds(await occasionBooks(), occasion);
  const index = INDEX[occasion.kind];
  const label = occasionLabel(occasion);
  const crumbs: Crumb[] = [{ label: index.crumb, href: index.href() }, { label }];

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
      eyebrow={occasion.kind === "parasha" ? "פרשת השבוע" : "חגים ומועדים"}
      title={occasion.kind === "parasha" ? `סיפורים לפרשת ${occasion.name}` : `סיפורים ל${occasion.name}`}
      emoji={occasion.emoji}
      description={occasionIntro(occasion)}
      crumbs={crumbs}
      siblingsLabel={occasion.kind === "parasha" ? "עוד פרשות" : "עוד חגים"}
      siblings={siblings.map((item) => ({
        label: item.name,
        href: occasionHref(item),
        emoji: occasion.kind === "holiday" ? item.emoji : undefined,
        selected: item.slug === occasion.slug,
      }))}
      refineHref={routes.books({ category: occasion.kind === "parasha" ? "parasha" : "judaism" })}
      emptyTitle={
        occasion.kind === "parasha"
          ? `הסיפור לפרשת ${occasion.name} עוד בהכנה`
          : `סיפורים ל${occasion.name} עוד בהכנה`
      }
    >
      <p>
        <Link
          href={index.href()}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {occasion.kind === "parasha" ? "לכל פרשות השבוע" : "לכל החגים"}
        </Link>
      </p>
    </BrowseView>
  );
}

// --- Index pages -------------------------------------------------------------------

export function occasionIndexMetadata(kind: OccasionKind): Metadata {
  const index = INDEX[kind];
  return {
    title: index.title,
    description: index.description,
    alternates: { canonical: index.href() },
  };
}

function OccasionLink({ occasion, count, highlight }: { occasion: Occasion; count: number; highlight?: boolean }) {
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
        {occasionLabel(occasion)}
      </span>
      <span className="text-sm text-muted">
        {highlight ? "עכשיו · " : ""}
        {count === 0 ? "בקרוב" : count === 1 ? "סיפור אחד" : `${count} סיפורים`}
      </span>
    </Link>
  );
}

export async function OccasionIndexView({ kind }: { kind: OccasionKind }) {
  const grouped = await occasionBooks();
  const index = INDEX[kind];
  const other = INDEX[kind === "parasha" ? "holiday" : "parasha"];
  const inSeason = new Set(currentSeasons(new Date()));

  const groups =
    kind === "parasha"
      ? parashotByBook().map((group) => ({ id: group.book, title: `ספר ${group.label}`, items: group.parashot }))
      : [{ id: "holidays", title: "שבת וחגים", items: [...HOLIDAYS] }];

  return (
    <main className="container-page flex flex-col gap-10 py-8 sm:py-10">
      <PageHeading
        title={index.title}
        emoji={index.emoji}
        description={index.description}
        crumbs={[{ label: "כל הספרים", href: routes.books() }, { label: index.crumb }]}
      >
        <p>
          <Link href={other.href()} className="font-semibold text-primary underline-offset-4 hover:underline">
            {kind === "parasha" ? "סיפורים לשבת ולחגים" : "סיפורים לפרשת השבוע"}
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
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
