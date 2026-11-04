import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { listingRobots } from "@/components/library/queries";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { libraryMessages } from "@/lib/i18n/library";
import { taxonomyText } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { READING_TIME_BUCKETS, getReadingTimeBucket } from "@/lib/taxonomy";
import { localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

/** Every reading-time bucket is built at deploy time. */
export function generateStaticParams(): { bucket: string }[] {
  return READING_TIME_BUCKETS.map((bucket) => ({ bucket: bucket.slug }));
}

interface Props {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<RawSearchParams>;
}

const DESCRIPTIONS: Record<string, string> = {
  "5": "סיפורים קצרצרים, לרגע קטן של ביחד.",
  "10": "סיפורים של שש עד עשר דקות.",
  "15": "סיפורים של אחת עשרה עד חמש עשרה דקות.",
  "20": "סיפורים ארוכים, לערב רגוע בלי למהר.",
};

/** Page titles as parents search for them ("סיפורים קצרים לילדים"). */
const SEARCH_TITLES: Record<string, string> = {
  "5": "סיפורים קצרים לילדים: עד 5 דקות קריאה",
  "10": "סיפורים קצרים לילדים: עד 10 דקות קריאה",
  "15": "סיפורים לילדים לפני השינה: עד 15 דקות קריאה",
  "20": "סיפורים ארוכים לילדים: 20 דקות ויותר",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bucket = getReadingTimeBucket((await params).bucket);
  if (!bucket) return localizeTitle({ title: "הדף לא נמצא", robots: { index: false } });
  const page = pageMetadata({
    title: SEARCH_TITLES[bucket.slug] ?? `סיפורים לילדים: ${bucket.label} קריאה`,
    description:
      `סיפורי ילדים לפי זמן קריאה: ${bucket.label}. ${DESCRIPTIONS[bucket.slug] ?? ""} עם ניקוד והקראה, לקריאה ולהאזנה בחינם.`
        .replace(/\s+/g, " ")
        .trim(),
    path: routes.time(bucket.slug),
  });
  return localizeTitle(
    { ...page, robots: await listingRobots({ timeBucket: bucket.slug }) },
    `Children's stories: ${taxonomyText("en", "time", bucket.slug, bucket).label.toLowerCase()} of reading`,
  );
}

export default async function TimePage({ params, searchParams }: Props) {
  const bucket = getReadingTimeBucket((await params).bucket);
  if (!bucket) notFound();
  const locale = await getLocale();
  const t = libraryMessages(locale);
  const text = taxonomyText(locale, "time", bucket.slug, bucket);

  return (
    <BrowseView
      path={routes.time(bucket.slug)}
      searchParams={await searchParams}
      base={{ timeBucket: bucket.slug }}
      eyebrow={t.time.eyebrow}
      title={text.label}
      emoji={bucket.emoji}
      description={t.time.descriptions[bucket.slug]}
      crumbs={[{ label: t.allBooksCrumb, href: routes.books() }, { label: text.label }]}
      siblingsLabel={t.time.siblings}
      siblings={READING_TIME_BUCKETS.map((item) => ({
        label: taxonomyText(locale, "time", item.slug, item).label,
        href: routes.time(item.slug),
        selected: item.slug === bucket.slug,
      }))}
      refineHref={routes.books({ time: bucket.slug })}
      emptyTitle={t.time.empty}
    />
  );
}
