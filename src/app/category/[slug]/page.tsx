import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { routes } from "@/lib/routes";
import { CATEGORIES, getCategory } from "@/lib/taxonomy";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

/** Every category is built at deploy time. */
export function generateStaticParams(): { slug: string }[] {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return { title: "הדף לא נמצא", robots: { index: false } };
  return {
    title: category.searchTitle ?? `סיפורי ${category.label} לילדים`,
    description: `${category.searchTitle ?? `סיפורי ${category.label} לילדים`}${category.description ? `: ${category.description}` : ""}. ספרים מאוירים לקריאה ולהאזנה אונליין, בחינם.`,
    alternates: { canonical: routes.category(category.slug) },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = getCategory((await params).slug);
  if (!category) notFound();

  return (
    <BrowseView
      path={routes.category(category.slug)}
      searchParams={await searchParams}
      base={{ category: category.slug }}
      eyebrow="קטגוריה"
      title={category.label}
      emoji={category.emoji}
      description={category.description}
      crumbs={[{ label: "כל הספרים", href: routes.books() }, { label: category.label }]}
      siblingsLabel="קטגוריות"
      siblings={CATEGORIES.map((item) => ({
        label: item.label,
        href: routes.category(item.slug),
        emoji: item.emoji,
        selected: item.slug === category.slug,
      }))}
      refineHref={routes.books({ category: category.slug })}
      emptyTitle="עוד אין ספרים בקטגוריה הזאת"
    />
  );
}
