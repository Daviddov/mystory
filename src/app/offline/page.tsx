import type { Metadata } from "next";
import { OfflineLibrary } from "@/components/pwa/OfflineLibrary";

export const metadata: Metadata = { title: "ספרים בלי רשת", robots: { index: false } };

/**
 * Offline fallback page. The service worker stores an anonymous copy of this
 * page (and of /offline/read) when it installs, and sends visitors here when a
 * page cannot be loaded. It must not show anything personal on the server side:
 * the list of books is read on the device.
 */
export default function OfflinePage() {
  return (
    <main className="container-page flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold">ספרים בלי רשת</h1>
        <p className="text-lg text-muted">הספרים שהורדתם למכשיר הזה. הם נפתחים גם כשאין חיבור לאינטרנט.</p>
      </header>
      <OfflineLibrary />
    </main>
  );
}
