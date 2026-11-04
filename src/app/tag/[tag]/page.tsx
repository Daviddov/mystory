import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BrowseView } from "@/components/library/BrowseView";
import { MAX_TAG_LENGTH, type RawSearchParams } from "@/components/library/filters";
import { listTagCounts } from "@/components/library/queries";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { libraryMessages } from "@/lib/i18n/library";
import { taxonomyText } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { tagFromSlug, tagIndexable, tagSlug } from "@/lib/taxonomy";
import { localizeTitle } from "@/lib/i18n/metadata";

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

/** Every tag with its book count, most used first. One read per request, shared by generateMetadata and the page. */
const allTagCounts = cache(() => listTagCounts(Number.POSITIVE_INFINITY));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const label = readTag((await params).tag);
  if (!label) return localizeTitle({ title: "הדף לא נמצא", robots: { index: false } });
  const wanted = tagSlug(label);
  const count = (await allTagCounts()).find((tag) => tagSlug(tag.label) === wanted)?.count ?? 0;
  return localizeTitle({
    ...pageMetadata({
      title: `סיפורים לילדים: ${label}`,
      description: `סיפורי ילדים שקשורים ל${label}: ספרים מאוירים עם ניקוד והקראה, לקריאה ולהאזנה בחינם.`,
      path: routes.tag(label),
    }),
    // A tag with a book or two is a thin listing: visitors can browse it, search engines skip it.
    ...(tagIndexable(count) ? {} : { robots: { index: false, follow: true } }),
  }, `Children's stories: ${taxonomyText("en", "tag", label, { label }).label}`);
}

export default async function TagPage({ params, searchParams }: Props) {
  const fromUrl = readTag((await params).tag);
  if (!fromUrl) notFound();

  const allTags = await allTagCounts();
  // Prefer the spelling stored on the books ("סבא וסבתא") over the one rebuilt from the URL.
  const wanted = tagSlug(fromUrl);
  const label = allTags.find((tag) => tagSlug(tag.label) === wanted)?.label ?? fromUrl;
  const tags = allTags.slice(0, 24);
  const locale = await getLocale();
  const t = libraryMessages(locale);
  // Starter tags have English names; other tags are free Hebrew text and stay as they are.
  const shownLabel = taxonomyText(locale, "tag", label, { label }).label;

  return (
    <BrowseView
      path={routes.tag(label)}
      searchParams={await searchParams}
      base={{ tag: label }}
      eyebrow={t.tag.eyebrow}
      title={locale === "he" ? label : <span dir="auto">{shownLabel}</span>}
      emoji="🏷️"
      crumbs={[{ label: t.allBooksCrumb, href: routes.books() }, { label: shownLabel }]}
      siblingsLabel={t.tag.siblings}
      siblings={tags.map((tag) => ({
        label: taxonomyText(locale, "tag", tag.label, tag).label,
        href: routes.tag(tag.label),
        selected: tagSlug(tag.label) === wanted,
      }))}
      refineHref={routes.books({ tag: label })}
      emptyTitle={t.tag.empty}
    />
  );
}
