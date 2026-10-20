import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OccasionView, occasionMetadata } from "@/components/library/OccasionPages";
import type { RawSearchParams } from "@/components/library/filters";
import { getOccasion } from "@/lib/occasions";

export const dynamic = "force-dynamic";

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
