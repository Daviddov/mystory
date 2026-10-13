import type { Metadata } from "next";
import { OfflineReader } from "@/components/pwa/OfflineReader";

export const metadata: Metadata = { title: "קריאה בלי רשת", robots: { index: false } };

/**
 * Reader for downloaded books: /offline/read?book=<bookId>&page=<1-based>.
 * The query string is read in the browser, so the same stored copy of this
 * page serves every downloaded book.
 */
export default function OfflineReadPage() {
  return <OfflineReader />;
}
