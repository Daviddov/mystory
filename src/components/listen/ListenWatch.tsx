"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { BookPlayer } from "@/components/reader/BookPlayer";
import { libraryMessages } from "@/lib/i18n/library";
import type { PlayerBook } from "@/lib/reader/logic";
import { routes } from "@/lib/routes";
import { Button, Spinner } from "@/components/ui";

export interface ListenWatchProps {
  bookId: string;
  /** Closes the picture view. */
  onExit: () => void;
  /** The book was read to its end: the queue opens the next one. */
  onFinished: () => void;
}

/** The bedtime queue with pictures: the same reader as the book's reading page, narrating on its own. */
export function ListenWatch({ bookId, onExit, onFinished }: ListenWatchProps) {
  const t = libraryMessages(useLocale()).watch;
  const [loaded, setLoaded] = useState<{ id: string; book: PlayerBook | null } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/listen/${encodeURIComponent(bookId)}`)
      .then((response) => (response.ok ? (response.json() as Promise<PlayerBook>) : null))
      .catch(() => null)
      .then((book) => {
        if (live) setLoaded({ id: bookId, book });
      });
    return () => {
      live = false;
    };
  }, [bookId]);

  if (loaded?.id !== bookId) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background" data-immersive="">
        <Spinner size="lg" label={t.opening} />
      </div>
    );
  }
  if (!loaded.book) {
    return (
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
        data-immersive=""
      >
        <p className="text-xl">{t.failed}</p>
        <div className="flex gap-3">
          <Button variant="primary" onClick={onFinished}>
            {t.next}
          </Button>
          <Button variant="outline" onClick={onExit}>
            {t.back}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <BookPlayer
      book={loaded.book}
      initialPage={0}
      autoNarrate
      onExit={onExit}
      exitHref={routes.listen()}
      onFinished={onFinished}
      countView
    />
  );
}
