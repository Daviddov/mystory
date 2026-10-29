"use client";

import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MockNotice } from "@/components/MockNotice";
import { saveProgress } from "@/components/personal/local-store";
import { Button, EmptyState, Spinner, buttonClasses } from "@/components/ui";
import { useWakeLock } from "@/components/reader/useWakeLock";
import { cn } from "@/lib/cn";
import { splitWords } from "@/lib/hebrew";
import { getDownload, offlineReadPath, type OfflineBook } from "./offline-store";

type State = { status: "loading" } | { status: "missing" } | { status: "ready"; book: OfflineBook };

function readLocation(): { bookId: string; page: number } {
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  return { bookId: params.get("book") ?? "", page: Number.isInteger(page) && page >= 1 ? page - 1 : 0 };
}

/**
 * A small self-contained reader for downloaded books. It needs nothing from
 * the server: the book comes from Cache Storage and its pictures and narration
 * are answered by the service worker. It is deliberately simpler than the main
 * reader (page turning, nikud, narration with word highlighting).
 */
export function OfflineReader() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [index, setIndex] = useState(0);
  const [nikud, setNikud] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const [audioFailed, setAudioFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useWakeLock(playing);

  useEffect(() => {
    let cancelled = false;
    const { bookId, page } = readLocation();
    if (!bookId) {
      // Reading the address is only possible in the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "missing" });
      return;
    }
    getDownload(bookId)
      .then((book) => {
        if (cancelled) return;
        if (!book || book.pages.length === 0) {
          setState({ status: "missing" });
          return;
        }
        setIndex(Math.min(page, book.pages.length - 1));
        setState({ status: "ready", book });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const book = state.status === "ready" ? state.book : null;
  const pageCount = book?.pages.length ?? 0;

  const goTo = useCallback(
    (next: number) => {
      if (!book) return;
      const clamped = Math.max(0, Math.min(next, book.pages.length - 1));
      audioRef.current?.pause();
      setPlaying(false);
      setActiveWord(-1);
      setAudioFailed(false);
      setIndex(clamped);
    },
    [book],
  );

  // Remember the position (on the device; it reaches the account when the network returns).
  useEffect(() => {
    if (!book) return;
    saveProgress(book.id, index, index === book.pages.length - 1 ? true : undefined);
    try {
      window.history.replaceState(null, "", offlineReadPath(book.id, index + 1));
    } catch {
      // ignore
    }
  }, [book, index]);

  // Hebrew reads right to left: the left arrow goes forward.
  useEffect(() => {
    if (!book) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" || event.key === "PageDown") goTo(index + 1);
      else if (event.key === "ArrowRight" || event.key === "PageUp") goTo(index - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book, index, goTo]);

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!book) {
    return (
      <EmptyState
        icon="🔎"
        title="הספר הזה לא שמור במכשיר"
        description="אפשר לקרוא בלי רשת רק ספרים שהורדתם מראש."
        action={
          <a href="/offline" className={buttonClasses()}>
            לספרים שהורדתי
          </a>
        }
      />
    );
  }

  const page = book.pages[index];
  const anyNikud = book.pages.some((p) => !!p.textNikud);
  const text = nikud && page.textNikud ? page.textNikud : page.text;
  const words = splitWords(text);
  const timings = page.wordTimings ?? [];
  const highlight = !!page.audio && timings.length > 0 && activeWord >= 0;
  const isLast = index === pageCount - 1;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setAudioFailed(true));
    } else {
      audio.pause();
    }
  };

  const onTimeUpdate = () => {
    const time = audioRef.current?.currentTime ?? 0;
    const current = timings.findIndex((t) => time >= t.start && time < t.end);
    setActiveWord(current);
  };

  return (
    <div data-immersive className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <a
          href="/offline"
          aria-label="סגירת הספר"
          className="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <X aria-hidden="true" />
        </a>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{book.title}</h1>
        {anyNikud ? (
          <Button
            variant={nikud ? "secondary" : "outline"}
            size="sm"
            aria-pressed={nikud}
            onClick={() => setNikud((value) => !value)}
          >
            ניקוד
          </Button>
        ) : null}
        <span className="shrink-0 text-sm text-muted" aria-live="polite">
          עמוד {index + 1} מתוך {pageCount}
        </span>
      </header>

      <div
        className="h-1.5 bg-surface-2"
        role="progressbar"
        aria-label="התקדמות בספר"
        aria-valuemin={1}
        aria-valuemax={pageCount}
        aria-valuenow={index + 1}
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${((index + 1) / pageCount) * 100}%` }} />
      </div>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-4">
        {page.image ? (
          <img
            key={page.image}
            src={page.image}
            alt=""
            className="aspect-[4/3] w-full rounded-lg border border-border bg-surface-2 object-contain"
          />
        ) : null}

        <p className={cn("story-text text-center", highlight ? "" : "whitespace-pre-line")} lang="he">
          {highlight
            ? words.map((word, wordIndex) => (
                <span key={wordIndex}>
                  <span className={wordIndex === activeWord ? "word-highlight" : undefined}>{word}</span>{" "}
                </span>
              ))
            : text}
        </p>

        {page.audio ? (
          <div className="flex flex-col items-center gap-2">
            <audio
              key={page.audio}
              ref={audioRef}
              src={page.audio}
              preload="auto"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setActiveWord(-1);
              }}
              onTimeUpdate={onTimeUpdate}
              onError={() => setAudioFailed(true)}
            />
            <Button variant="secondary" size="lg" onClick={togglePlay} disabled={audioFailed}>
              {playing ? <Pause aria-hidden="true" className="size-6" /> : <Play aria-hidden="true" className="size-6" />}
              {playing ? "עצירה" : "הקראה"}
            </Button>
            {page.audioSource === "mock" ? <MockNotice kind="tts" variant="inline" /> : null}
            {audioFailed ? (
              <p role="alert" className="text-sm text-danger">
                ההקראה של העמוד הזה לא נטענה.
              </p>
            ) : null}
          </div>
        ) : null}
      </main>

      <nav aria-label="דפדוף" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <Button variant="outline" size="lg" onClick={() => goTo(index - 1)} disabled={index === 0}>
          <ChevronRight aria-hidden="true" className="size-6" />
          הקודם
        </Button>
        {isLast ? (
          <a href="/offline" className={buttonClasses({ size: "lg" })}>
            הסוף! חזרה לספרים
          </a>
        ) : (
          <Button size="lg" onClick={() => goTo(index + 1)}>
            הבא
            <ChevronLeft aria-hidden="true" className="size-6" />
          </Button>
        )}
      </nav>
    </div>
  );
}
