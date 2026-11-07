import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OccasionView, occasionMetadata } from "@/components/library/OccasionPages";
import type { RawSearchParams } from "@/components/library/filters";
import { getOccasion } from "@/lib/occasions";
import { localizeTitle } from "@/lib/i18n/metadata";
import { occasionNameEn } from "@/lib/i18n/library";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

/** Each page is rendered on its first visit, then cached. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = occasionNameEn("parasha", slug);
  return localizeTitle(
    occasionMetadata("parasha", slug),
    `Parashat ${name}: stories for children`,
    `Children's stories for Parashat ${name}, the weekly Torah portion: illustrated, with nikud and narration. Free, with no sign-up.`,
  );
}

export default async function ParashaPage({ params, searchParams }: Props) {
  const occasion = getOccasion("parasha", (await params).slug);
  if (!occasion) notFound();
  return <OccasionView occasion={occasion} searchParams={await searchParams} />;
}
