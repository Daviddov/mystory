import type { Metadata } from "next";
import { OccasionIndexView, occasionIndexMetadata } from "@/components/library/OccasionPages";
import { localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

const HEBREW_METADATA: Metadata = occasionIndexMetadata("parasha");

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(
    HEBREW_METADATA,
    "Weekly Torah portion stories for children",
    "Children's stories for every weekly Torah portion (parasha), from Bereshit to Devarim: illustrated, with nikud and narration. Free, with no sign-up.",
  );
}

export default function ParashotPage() {
  return <OccasionIndexView kind="parasha" />;
}
