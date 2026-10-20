import type { Metadata } from "next";
import { OccasionIndexView, occasionIndexMetadata } from "@/components/library/OccasionPages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = occasionIndexMetadata("holiday");

export default function HolidaysPage() {
  return <OccasionIndexView kind="holiday" />;
}
