"use client";

import { BookOpen, Trash2, WifiOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, EmptyState, Spinner, buttonClasses } from "@/components/ui";
import { accountMessages, type AccountMessages } from "@/lib/i18n/account";
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
import { useDeviceLocale } from "./useDeviceLocale";

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function formatBytes(bytes: number, t: AccountMessages["offline"]): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? t.megabytes(mb.toFixed(mb >= 10 ? 0 : 1)) : t.kilobytes(String(Math.max(1, Math.round(bytes / 1024))));
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
  const t = accountMessages(useDeviceLocale()).offline;
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
        title={t.unsupportedTitle}
        description={t.unsupportedDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {online ? null : (
        <p role="status" className="flex items-center gap-2 rounded-md bg-warning-soft px-4 py-3 font-semibold">
          <WifiOff aria-hidden="true" className="size-5 shrink-0 text-warning" />
          {t.noNetwork}
        </p>
      )}
      {loaded.ready || loaded.books.length === 0 ? null : (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
          {t.notActive}
        </p>
      )}

      {loaded.books.length === 0 ? (
        <EmptyState
          icon="📥"
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            online ? (
              <a href="/books" className={buttonClasses()}>
                {t.allBooks}
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
                aria-label={t.readAria(book.title)}
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
                <h2 className="text-xl font-bold leading-snug" dir="auto">
                  {book.title}
                </h2>
                <p className="text-sm text-muted">
                  {t.pages(book.pages.length)}
                  {book.isPublic ? "" : t.privateBook}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <a href={offlineReadPath(book.id)} className={buttonClasses({ size: "sm" })}>
                    <BookOpen aria-hidden="true" className="size-4" />
                    {t.read}
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeDownload(book.id)}
                    aria-label={t.removeAria(book.title)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    {t.remove}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {loaded.usage !== null && loaded.books.length > 0 ? (
        <p className="text-sm text-muted">{t.usage(formatBytes(loaded.usage, t))}</p>
      ) : null}
    </div>
  );
}
