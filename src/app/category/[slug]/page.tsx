import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BedtimeGuide } from "@/components/library/BedtimeGuide";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
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
  const title = category.searchTitle ?? `סיפורי ${category.label} לילדים`;
  return pageMetadata({
    title,
    description: `${title}${category.description ? `: ${category.description}` : ""}. סיפורי ילדים מאוירים עם ניקוד והקראה, לקריאה ולהאזנה אונליין, בחינם.`,
    path: routes.category(category.slug),
  });
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
      // The heading parents search for ("סיפורים לפני השינה לילדים"), not the short chip label.
      title={category.searchTitle ?? category.label}
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
      footer={category.slug === "bedtime" ? <BedtimeGuide /> : null}
    >
      {category.slug === "parasha" || category.slug === "judaism" ? <OccasionLinks /> : null}
    </BrowseView>
  );
}

/** The parasha and holiday landing pages, from the Jewish categories. */
function OccasionLinks() {
  const link = "font-semibold text-primary underline-offset-4 hover:underline";
  return (
    <p className="flex flex-wrap gap-x-6 gap-y-2">
      <Link href={routes.parashot()} className={link}>
        📜 סיפור לכל פרשה בתורה
      </Link>
      <Link href={routes.holidays()} className={link}>
        🕯️ סיפורים לשבת ולחגים
      </Link>
    </p>
  );
}
