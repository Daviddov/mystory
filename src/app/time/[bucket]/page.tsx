import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { routes } from "@/lib/routes";
import { READING_TIME_BUCKETS, getReadingTimeBucket } from "@/lib/taxonomy";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bucket = getReadingTimeBucket((await params).bucket);
  if (!bucket) return { title: "הדף לא נמצא", robots: { index: false } };
  return {
    title: `סיפורים של ${bucket.label}`,
    description: `סיפורים לילדים לפי זמן קריאה: ${bucket.label}. ${DESCRIPTIONS[bucket.slug] ?? ""}`.trim(),
    alternates: { canonical: routes.time(bucket.slug) },
  };
}

export default async function TimePage({ params, searchParams }: Props) {
  const bucket = getReadingTimeBucket((await params).bucket);
  if (!bucket) notFound();

  return (
    <BrowseView
      path={routes.time(bucket.slug)}
      searchParams={await searchParams}
      base={{ timeBucket: bucket.slug }}
      eyebrow="ספרים לפי זמן קריאה"
      title={bucket.label}
      emoji={bucket.emoji}
      description={DESCRIPTIONS[bucket.slug]}
      crumbs={[{ label: "כל הספרים", href: routes.books() }, { label: bucket.label }]}
      siblingsLabel="זמני קריאה"
      siblings={READING_TIME_BUCKETS.map((item) => ({
        label: item.label,
        href: routes.time(item.slug),
        selected: item.slug === bucket.slug,
      }))}
      refineHref={routes.books({ time: bucket.slug })}
      emptyTitle="עוד אין ספרים באורך הזה"
    />
  );
}
