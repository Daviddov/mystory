import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OccasionView, occasionMetadata } from "@/components/library/OccasionPages";
import type { RawSearchParams } from "@/components/library/filters";
import { getOccasion } from "@/lib/occasions";

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
  return occasionMetadata("holiday", (await params).slug);
}

export default async function HolidayPage({ params, searchParams }: Props) {
  const occasion = getOccasion("holiday", (await params).slug);
  if (!occasion) notFound();
  return <OccasionView occasion={occasion} searchParams={await searchParams} />;
}
