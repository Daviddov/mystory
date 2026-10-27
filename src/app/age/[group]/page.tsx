import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { AGE_GROUP_INFO, getAgeGroup } from "@/lib/taxonomy";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

/** Every age group is built at deploy time. */
export function generateStaticParams(): { group: string }[] {
  return AGE_GROUP_INFO.map((age) => ({ group: age.slug }));
}

interface Props {
  params: Promise<{ group: string }>;
  searchParams: Promise<RawSearchParams>;
}

/** Titles and descriptions in the words parents search with ("סיפורים לגיל 3", "סיפורים לגיל הרך", "לגן"). */
const AGE_SEARCH: Record<string, { title: string; description: string }> = {
  "0-2": {
    title: "סיפורים לפעוטות ולגיל הרך: גילאי 0 עד 2",
    description:
      "סיפורי ילדים לתינוקות ופעוטות, לגיל שנה ולגיל שנתיים: משפטים קצרים, חזרות וצלילים, עם איורים גדולים, ניקוד והקראה. לקריאה ולהאזנה, בחינם.",
  },
  "3-5": {
    title: "סיפורים לגיל הרך ולגן: גילאי 3 עד 5",
    description:
      "סיפורי ילדים לגיל 3, לגיל 4 ולגיל 5, לבית ולגן: סיפורים פשוטים עם התחלה, אמצע וסוף, עם ניקוד והקראה. לקריאה ולהאזנה לפני השינה, בחינם.",
  },
  "6-8": {
    title: "סיפורי ילדים לגילאי 6 עד 8 ולכיתה א",
    description:
      "סיפורי ילדים לגיל 6, 7 ו-8: עלילה עשירה לקוראים מתחילים, עם ניקוד מלא לקריאה עצמאית בכיתה א ו-ב, והקראה להאזנה. בחינם.",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const age = getAgeGroup((await params).group);
  if (!age) return { title: "הדף לא נמצא", robots: { index: false } };
  const search = AGE_SEARCH[age.slug] ?? {
    title: `סיפורי ילדים ל${age.label}`,
    description: `סיפורי ילדים ל${age.label}: ${age.description}. עם ניקוד והקראה, לקריאה ולהאזנה בחינם.`,
  };
  return pageMetadata({ ...search, path: routes.age(age.slug) });
}

export default async function AgePage({ params, searchParams }: Props) {
  const age = getAgeGroup((await params).group);
  if (!age) notFound();

  return (
    <BrowseView
      path={routes.age(age.slug)}
      searchParams={await searchParams}
      base={{ ageGroup: age.slug }}
      ageFilter={false}
      eyebrow="ספרים לפי גיל"
      title={`סיפורים ל${age.label}`}
      emoji={age.emoji}
      description={age.description}
      crumbs={[{ label: "כל הספרים", href: routes.books() }, { label: age.label }]}
      siblingsLabel="קבוצות גיל"
      siblings={AGE_GROUP_INFO.map((item) => ({
        label: item.label,
        href: routes.age(item.slug),
        emoji: item.emoji,
        selected: item.slug === age.slug,
      }))}
      refineHref={routes.books({ age: age.slug })}
      emptyTitle="עוד אין ספרים לגיל הזה"
    />
  );
}
