"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { MockNotice } from "@/components/MockNotice";
import { Button, Spinner } from "@/components/ui";
import { hasNikud } from "@/lib/hebrew";
import { mediaUrl } from "@/lib/media/url";
import type { BookWithPages } from "@/lib/types";

interface PlayerProps {
  book: BookWithPages;
  variant?: "page" | "embedded";
  initialPage?: number;
  persist?: boolean;
  syncProgress?: boolean;
  syncUrl?: boolean;
}

export interface PreviewPaneProps {
  /** The book as it is in the editor right now, including unsaved changes. */
  book: BookWithPages;
  /** Zero-based page to open first. */
  initialPage?: number;
}

/**
 * Live preview. Uses the site's real reading player when it is available, so
 * the preview is exactly what a child will see; otherwise (the reader module
 * is missing or crashes) a plain page-by-page preview.
 */
export function PreviewPane({ book, initialPage = 0 }: PreviewPaneProps) {
  const [player, setPlayer] = useState<{ Player: ComponentType<PlayerProps> | null } | null>(null);

  useEffect(() => {
    let alive = true;
    import("@/components/reader")
      .then((mod) => {
        const candidate = (mod as { BookPlayer?: unknown }).BookPlayer;
        if (alive) setPlayer({ Player: typeof candidate === "function" ? (candidate as ComponentType<PlayerProps>) : null });
      })
      .catch(() => {
        if (alive) setPlayer({ Player: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (book.pages.length === 0) {
    return <p className="rounded-md bg-surface-2 p-6 text-center text-muted">אין עדיין עמודים להציג.</p>;
  }
  if (!player) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="טוען תצוגה מקדימה…" />
      </div>
    );
  }

  const fallback = <SimplePreview book={book} initialPage={initialPage} />;
  if (!player.Player) return fallback;
  const Player = player.Player;
  return (
    <PreviewBoundary fallback={fallback}>
      {/* `contain` keeps any fixed-position layer of the player inside this box. */}
      <div className="relative h-[min(46rem,78dvh)] overflow-hidden rounded-lg [contain:layout_paint]">
        <Player book={book} variant="embedded" initialPage={initialPage} persist={false} syncProgress={false} syncUrl={false} />
      </div>
    </PreviewBoundary>
  );
}

class PreviewBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn("[studio] the reading player failed in the preview; showing the simple preview", error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Minimal page-by-page preview with no dependency on the reader module. */
export function SimplePreview({ book, initialPage = 0 }: PreviewPaneProps) {
  const [requested, setRequested] = useState(initialPage);
  const [nikud, setNikud] = useState(false);
  const index = Math.min(Math.max(requested, 0), book.pages.length - 1);
  const page = book.pages[index];
  const image = mediaUrl(page.image, book.updatedAt);
  const audio = mediaUrl(page.audio, book.updatedAt);
  const bookHasNikud = book.pages.some((p) => !!p.textNikud && hasNikud(p.textNikud));
  const text = nikud && page.textNikud ? page.textNikud : page.text;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-surface-2">
        {image ? (
          <img src={image} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-6xl" aria-hidden="true">
            🖼️
          </span>
        )}
      </div>
      <p className="story-text whitespace-pre-wrap text-center" dir="rtl">
        {text || <span className="text-muted">אין טקסט בעמוד הזה</span>}
      </p>
      {audio ? <audio key={audio} controls preload="none" src={audio} className="w-full" /> : null}
      {page.audio && page.audioSource === "mock" ? <MockNotice kind="tts" variant="inline" /> : null}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setRequested(index - 1)} disabled={index === 0}>
          <ChevronRight aria-hidden="true" />
          הקודם
        </Button>
        <div className="flex flex-col items-center gap-1">
          <span className="font-semibold" aria-live="polite">
            עמוד {index + 1} מתוך {book.pages.length}
          </span>
          {bookHasNikud ? (
            <button type="button" className="text-sm underline" aria-pressed={nikud} onClick={() => setNikud(!nikud)}>
              {nikud ? "בלי ניקוד" : "עם ניקוד"}
            </button>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => setRequested(index + 1)} disabled={index === book.pages.length - 1}>
          הבא
          <ChevronLeft aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
