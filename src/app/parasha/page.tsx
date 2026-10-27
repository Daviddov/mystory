import type { Metadata } from "next";
import { OccasionIndexView, occasionIndexMetadata } from "@/components/library/OccasionPages";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

export const metadata: Metadata = occasionIndexMetadata("parasha");

export default function ParashotPage() {
  return <OccasionIndexView kind="parasha" />;
}
