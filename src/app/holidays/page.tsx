import type { Metadata } from "next";
import { OccasionIndexView, occasionIndexMetadata } from "@/components/library/OccasionPages";
import { localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

const HEBREW_METADATA: Metadata = occasionIndexMetadata("holiday");

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Holiday stories for children: stories for Shabbat and the Jewish holidays");
}

export default function HolidaysPage() {
  return <OccasionIndexView kind="holiday" />;
}
