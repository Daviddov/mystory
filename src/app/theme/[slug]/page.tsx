import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import type { RawSearchParams } from "@/components/library/filters";
import { routes } from "@/lib/routes";
import { THEMES, getTheme } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const theme = getTheme((await params).slug);
  if (!theme) return { title: "הדף לא נמצא", robots: { index: false } };
  return {
    title: `סיפורים על ${theme.label}`,
    description: `סיפורים לילדים שפותחים שיחה על ${theme.label}, עם שאלות לשיחה בסוף כל ספר.`,
    alternates: { canonical: routes.theme(theme.slug) },
  };
}

export default async function ThemePage({ params, searchParams }: Props) {
  const theme = getTheme((await params).slug);
  if (!theme) notFound();

  return (
    <BrowseView
      path={routes.theme(theme.slug)}
      searchParams={await searchParams}
      base={{ theme: theme.slug }}
      eyebrow="נושא לשיחה"
      title={`סיפורים על ${theme.label}`}
      emoji={theme.emoji}
      description="ספרים שעוזרים לפתוח שיחה על הנושא הזה. בעמוד של כל ספר מחכות שאלות לשיחה."
      crumbs={[{ label: "כל הספרים", href: routes.books() }, { label: theme.label }]}
      siblingsLabel="נושאים לשיחה"
      siblings={THEMES.map((item) => ({
        label: item.label,
        href: routes.theme(item.slug),
        emoji: item.emoji,
        selected: item.slug === theme.slug,
      }))}
      refineHref={routes.books({ theme: theme.slug })}
      emptyTitle="עוד אין ספרים בנושא הזה"
    />
  );
}
