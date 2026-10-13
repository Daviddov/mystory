"use client";

import { BookOpen, Trash2, WifiOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, EmptyState, Spinner, buttonClasses } from "@/components/ui";
import {
  OFFLINE_EVENT,
  listDownloads,
  offlineReadPath,
  offlineReady,
  offlineSupported,
  removeDownload,
  storageEstimate,
  type OfflineBook,
} from "./offline-store";

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} מ"ב` : `${Math.max(1, Math.round(bytes / 1024))} ק"ב`;
}

interface Loaded {
  supported: boolean;
  ready: boolean;
  books: OfflineBook[];
  usage: number | null;
}

/**
 * The list of books kept on this device. Everything here comes from Cache
 * Storage, so the page works with no network at all. Links are plain <a>
 * elements on purpose: a full page load is answered by the service worker,
 * while a client-side navigation would need the server.
 */
export function OfflineLibrary() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const supported = offlineSupported();
      const books = supported ? await listDownloads().catch(() => []) : [];
      const estimate = supported ? await storageEstimate() : null;
      if (!cancelled) setLoaded({ supported, ready: offlineReady(), books, usage: estimate?.usage ?? null });
    };
    void refresh();
    window.addEventListener(OFFLINE_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_EVENT, refresh);
    };
  }, []);

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!loaded.supported) {
    return (
      <EmptyState
        icon="📵"
        title="הדפדפן הזה לא שומר ספרים"
        description="קריאה בלי רשת דורשת דפדפן עדכני וכתובת מאובטחת (https). אפשר להמשיך לקרוא כרגיל כשיש חיבור."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {online ? null : (
        <p role="status" className="flex items-center gap-2 rounded-md bg-warning-soft px-4 py-3 font-semibold">
          <WifiOff aria-hidden="true" className="size-5 shrink-0 text-warning" />
          אין כרגע חיבור לרשת. הספרים שכאן נקראים גם ככה.
        </p>
      )}
      {loaded.ready || loaded.books.length === 0 ? null : (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
          הספרים שמורים במכשיר, אבל הקריאה בלי רשת עדיין לא פעילה בדפדפן הזה. טענו את העמוד מחדש כשיש חיבור.
        </p>
      )}

      {loaded.books.length === 0 ? (
        <EmptyState
          icon="📥"
          title="עדיין לא הורדתם ספרים"
          description='בעמוד של כל ספר יש כפתור "הורדה לקריאה בלי רשת". ספר שהורדתם יחכה כאן, גם בטיסה וגם בטיול.'
          action={
            online ? (
              <a href="/books" className={buttonClasses()}>
                לכל הספרים
              </a>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loaded.books.map((book) => (
            <li
              key={book.id}
              className="flex gap-4 rounded-lg border border-border bg-surface p-4 shadow-card"
            >
              <a
                href={offlineReadPath(book.id)}
                aria-label={`קריאת הספר ${book.title}`}
                className="block aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2"
              >
                {book.cover ? (
                  <img src={book.cover} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-4xl" aria-hidden="true">
                    📖
                  </span>
                )}
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <h2 className="text-xl font-bold leading-snug">{book.title}</h2>
                <p className="text-sm text-muted">
                  {book.pages.length} עמודים
                  {book.isPublic ? "" : " · ספר פרטי"}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <a href={offlineReadPath(book.id)} className={buttonClasses({ size: "sm" })}>
                    <BookOpen aria-hidden="true" className="size-4" />
                    קריאה
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeDownload(book.id)}
                    aria-label={`הסרת ${book.title} מהמכשיר`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    הסרה
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {loaded.usage !== null && loaded.books.length > 0 ? (
        <p className="text-sm text-muted">האתר תופס כ-{formatBytes(loaded.usage)} במכשיר הזה.</p>
      ) : null}
    </div>
  );
}
