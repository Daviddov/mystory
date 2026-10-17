import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { routes } from "@/lib/routes";
import { AGE_GROUP_INFO, getAgeGroup } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ group: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const age = getAgeGroup((await params).group);
  if (!age) return { title: "הדף לא נמצא", robots: { index: false } };
  return {
    title: `סיפורים לילדים ב${age.label}`,
    description: `סיפורים וספרים לילדים ב${age.label}: ${age.description}. לקריאה ולהאזנה אונליין, בחינם.`,
    alternates: { canonical: routes.age(age.slug) },
  };
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
      title={age.label}
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
