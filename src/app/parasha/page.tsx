import type { Metadata } from "next";
import { OccasionIndexView, occasionIndexMetadata } from "@/components/library/OccasionPages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = occasionIndexMetadata("parasha");

export default function ParashotPage() {
  return <OccasionIndexView kind="parasha" />;
}
