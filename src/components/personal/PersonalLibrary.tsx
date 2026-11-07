"use client";

import Link from "@/components/i18n/LocaleLink";
import { useEffect, useMemo, useState } from "react";
import { BookCard } from "@/components/BookCard";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { accountMessages } from "@/lib/i18n/account";
import { routes } from "@/lib/routes";
import type { Book } from "@/lib/types";
import { FavoriteButton } from "./FavoriteButton";
import { usePersonal } from "./hooks";
import type { LocalProgress } from "./local-store";

export interface PersonalLibraryProps {
  /** 'all': continue reading, favorites and history. 'favorites': favorites only. */
  mode?: "all" | "favorites";
  signedIn: boolean;
}

const GRID = "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

function formatDate(iso: string, dateLocale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long" }).format(date);
}

type LoadState = { key: string; books: Map<string, Book>; failed: boolean };

/**
 * The personal shelves of /me. Reads favorites and progress from the device
 * store (which mirrors the account for signed-in users) and asks the server
 * for the cards of those books.
 */
export function PersonalLibrary({ mode = "all", signedIn }: PersonalLibraryProps) {
  const personal = usePersonal();
  const locale = useLocale();
  const messages = accountMessages(locale);
  const t = messages.library;
  const ids = useMemo(() => {
    const set = new Set<string>(personal.favorites.map((f) => f.bookId));
    if (mode === "all") for (const p of personal.progress) set.add(p.bookId);
    return [...set].sort();
  }, [personal.favorites, personal.progress, mode]);
  const key = ids.join(",");

  const [loaded, setLoaded] = useState<LoadState>({ key: "", books: new Map(), failed: false });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/me/books?ids=${encodeURIComponent(key)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { books: Book[] };
        setLoaded({ key, books: new Map(body.books.map((b) => [b.id, b])), failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded((previous) => ({ ...previous, key, failed: true }));
      });
    return () => controller.abort();
  }, [key]);

  // Before the device store was read (server render, first paint) we do not know yet.
  const waitingForAccount = signedIn && personal.status !== "synced" && personal.status !== "error";
  if (!personal.loaded || (waitingForAccount && ids.length === 0) || (key !== "" && loaded.key === "")) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  // While a changed list is being fetched the previous cards stay on screen.
  const books = loaded.books;
  const favorites = personal.favorites.flatMap((f) => (books.has(f.bookId) ? [books.get(f.bookId)!] : []));
  const withBook = (list: LocalProgress[]) =>
    list.flatMap((p) => (books.has(p.bookId) ? [{ progress: p, book: books.get(p.bookId)! }] : []));
  const inProgress = withBook(personal.progress.filter((p) => !p.completed));
  const history = withBook(personal.progress);

  const notices = (
    <>
      {loaded.failed && key ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3">
          {t.loadFailed}
        </p>
      ) : null}
      {signedIn && personal.status === "error" ? (
        <p role="status" className="rounded-md bg-warning-soft px-4 py-3">
          {t.accountOffline}
        </p>
      ) : null}
    </>
  );

  const favoritesSection = (
    <section aria-labelledby="favorites-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="favorites-title" className="text-2xl font-extrabold">
          <span aria-hidden="true">❤️ </span>
          {t.favorites}
        </h2>
        {mode === "all" && favorites.length > 6 ? (
          <ButtonLink href={routes.favorites()} variant="ghost" size="sm">
            {t.allFavorites}
          </ButtonLink>
        ) : null}
      </div>
      {favorites.length === 0 ? (
        <EmptyState
          icon="❤️"
          title={t.noFavoritesTitle}
          description={t.noFavoritesDescription}
          action={<ButtonLink href={routes.books()}>{t.allBooks}</ButtonLink>}
        />
      ) : (
        <ul className={GRID}>
          {(mode === "all" ? favorites.slice(0, 12) : favorites).map((book) => (
            <li key={book.id}>
              <BookCard book={book} locale={locale} footer={<FavoriteButton bookId={book.id} title={book.title} />} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (mode === "favorites") {
    return (
      <div className="flex flex-col gap-8">
        {notices}
        {favoritesSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      {notices}

      <section aria-labelledby="continue-title" className="flex flex-col gap-4">
        <h2 id="continue-title" className="text-2xl font-extrabold">
          <span aria-hidden="true">📖 </span>
          {t.continueReading}
        </h2>
        {inProgress.length === 0 ? (
          <EmptyState
            icon="📖"
            title={t.noOpenTitle}
            description={t.noOpenDescription}
            action={<ButtonLink href={routes.books()}>{t.chooseBook}</ButtonLink>}
          />
        ) : (
          <ul className={GRID}>
            {inProgress.slice(0, 12).map(({ book, progress }) => (
              <li key={book.id}>
                <BookCard
                  book={book}
                  locale={locale}
                  href={routes.read(book.slug, progress.pageIndex + 1)}
                  badge={t.pageBadge(progress.pageIndex + 1)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {favoritesSection}

      <section aria-labelledby="history-title" className="flex flex-col gap-4">
        <h2 id="history-title" className="text-2xl font-extrabold">
          <span aria-hidden="true">🕰️ </span>
          {t.recent}
        </h2>
        {history.length === 0 ? (
          <p className="text-muted">{t.noHistory}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {history.slice(0, 30).map(({ book, progress }) => (
              <li key={book.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Link href={routes.book(book.slug)} dir="auto" className="min-w-0 flex-1 text-lg font-bold hover:underline">
                  {book.title}
                </Link>
                <span className="text-sm text-muted">
                  {progress.completed ? t.finished : t.stoppedAt(progress.pageIndex + 1)}
                  {formatDate(progress.updatedAt, messages.dateLocale)
                    ? ` · ${formatDate(progress.updatedAt, messages.dateLocale)}`
                    : ""}
                </span>
                <ButtonLink
                  href={progress.completed ? routes.read(book.slug) : routes.read(book.slug, progress.pageIndex + 1)}
                  variant="outline"
                  size="sm"
                >
                  {progress.completed ? t.readAgain : t.continue}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
