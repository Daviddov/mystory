import type { Metadata } from "next";
import { OfflineReader } from "@/components/pwa/OfflineReader";
import { localizeTitle } from "@/lib/i18n/metadata";

const HEBREW_METADATA: Metadata = { title: "קריאה בלי רשת", robots: { index: false } };

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Reading offline");
}

/**
 * Reader for downloaded books: /offline/read?book=<bookId>&page=<1-based>.
 * The query string is read in the browser, so the same stored copy of this
 * page serves every downloaded book.
 */
export default function OfflineReadPage() {
  return <OfflineReader />;
}
