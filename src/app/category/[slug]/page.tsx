import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BedtimeGuide } from "@/components/library/BedtimeGuide";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { listingRobots } from "@/components/library/queries";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { libraryMessages } from "@/lib/i18n/library";
import type { Locale } from "@/lib/i18n/locale";
import { taxonomyText } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { CATEGORIES, getCategory } from "@/lib/taxonomy";
import { localizeTitle } from "@/lib/i18n/metadata";

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
  if (!category) return localizeTitle({ title: "הדף לא נמצא", robots: { index: false } });
  const title = category.searchTitle ?? `סיפורי ${category.label} לילדים`;
  const page = pageMetadata({
    title,
    description: `${title}${category.description ? `: ${category.description}` : ""}. סיפורי ילדים מאוירים עם ניקוד והקראה, לקריאה ולהאזנה אונליין, בחינם.`,
    path: routes.category(category.slug),
  });
  return localizeTitle(
    { ...page, robots: await listingRobots({ category: category.slug }) },
    `${taxonomyText("en", "category", category.slug, category).label}: stories for children`,
  );
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  const locale = await getLocale();
  const t = libraryMessages(locale);
  const text = taxonomyText(locale, "category", category.slug, category);

  return (
    <BrowseView
      path={routes.category(category.slug)}
      searchParams={await searchParams}
      base={{ category: category.slug }}
      eyebrow={t.category.eyebrow}
      // The heading parents search for ("סיפורים לפני השינה לילדים"), not the short chip label.
      title={locale === "he" ? (category.searchTitle ?? category.label) : text.label}
      emoji={category.emoji}
      description={text.description}
      crumbs={[{ label: t.allBooksCrumb, href: routes.books() }, { label: text.label }]}
      siblingsLabel={t.category.siblings}
      siblings={CATEGORIES.map((item) => ({
        label: taxonomyText(locale, "category", item.slug, item).label,
        href: routes.category(item.slug),
        emoji: item.emoji,
        selected: item.slug === category.slug,
      }))}
      refineHref={routes.books({ category: category.slug })}
      emptyTitle={t.category.empty}
      footer={category.slug === "bedtime" ? <BedtimeGuide locale={locale} /> : null}
    >
      {category.slug === "parasha" || category.slug === "judaism" ? <OccasionLinks locale={locale} /> : null}
    </BrowseView>
  );
}

/** The parasha and holiday landing pages, from the Jewish categories. */
function OccasionLinks({ locale }: { locale: Locale }) {
  const t = libraryMessages(locale).category;
  const link = "font-semibold text-primary underline-offset-4 hover:underline";
  return (
    <p className="flex flex-wrap gap-x-6 gap-y-2">
      <Link href={routes.parashot()} className={link}>
        📜 {t.parashaLink}
      </Link>
      <Link href={routes.holidays()} className={link}>
        🕯️ {t.holidaysLink}
      </Link>
    </p>
  );
}
