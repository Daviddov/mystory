import type { Metadata } from "next";
import { OfflineHeading } from "@/components/pwa/OfflineHeading";
import { OfflineLibrary } from "@/components/pwa/OfflineLibrary";
import { localizeTitle } from "@/lib/i18n/metadata";

const HEBREW_METADATA: Metadata = { title: "ספרים בלי רשת", robots: { index: false } };

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Offline books");
}

/**
 * Offline fallback page. The service worker stores an anonymous copy of this
 * page (and of /offline/read) when it installs, and sends visitors here when a
 * page cannot be loaded. It must not show anything personal on the server side:
 * the list of books is read on the device.
 */
export default function OfflinePage() {
  return (
    <main className="container-page flex flex-col gap-6 py-8">
      <OfflineHeading />
      <OfflineLibrary />
    </main>
  );
}
