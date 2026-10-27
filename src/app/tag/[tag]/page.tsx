import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/library/BrowseView";
import { MAX_TAG_LENGTH, type RawSearchParams } from "@/components/library/filters";
import { listTagCounts } from "@/components/library/queries";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { tagFromSlug, tagSlug } from "@/lib/taxonomy";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

/** Tags are open-ended: each tag page is rendered on its first visit, then cached. */
export function generateStaticParams(): { tag: string }[] {
  return [];
}

interface Props {
  params: Promise<{ tag: string }>;
  searchParams: Promise<RawSearchParams>;
}

/** The tag label from the URL segment, or null when it is empty or absurdly long. */
function readTag(segment: string): string | null {
  const label = tagFromSlug(segment);
  if (label === "" || label.length > MAX_TAG_LENGTH) return null;
  return label;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const label = readTag((await params).tag);
  if (!label) return { title: "הדף לא נמצא", robots: { index: false } };
  return pageMetadata({
    title: `סיפורים לילדים: ${label}`,
    description: `סיפורי ילדים שקשורים ל${label}: ספרים מאוירים עם ניקוד והקראה, לקריאה ולהאזנה בחינם.`,
    path: routes.tag(label),
  });
}

export default async function TagPage({ params, searchParams }: Props) {
  const fromUrl = readTag((await params).tag);
  if (!fromUrl) notFound();

  const tags = await listTagCounts(24);
  // Prefer the spelling stored on the books ("סבא וסבתא") over the one rebuilt from the URL.
  const wanted = tagSlug(fromUrl);
  const label = tags.find((tag) => tagSlug(tag.label) === wanted)?.label ?? fromUrl;

  return (
    <BrowseView
      path={routes.tag(label)}
      searchParams={await searchParams}
      base={{ tag: label }}
      eyebrow="תגית"
      title={label}
      emoji="🏷️"
      crumbs={[{ label: "כל הספרים", href: routes.books() }, { label }]}
      siblingsLabel="תגיות נפוצות"
      siblings={tags.map((tag) => ({
        label: tag.label,
        href: routes.tag(tag.label),
        selected: tagSlug(tag.label) === wanted,
      }))}
      refineHref={routes.books({ tag: label })}
      emptyTitle="עוד אין ספרים עם התגית הזאת"
    />
  );
}
