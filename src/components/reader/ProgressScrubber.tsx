"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { clamp, progressPercent } from "@/lib/reader/logic";

export interface ProgressScrubberProps {
  /** Zero-based page; `pageCount` is the end screen. */
  index: number;
  pageCount: number;
  onJump: (page: number) => void;
  /**
   * Direction the book's pages turn in. The bar fills from the side the book starts on.
   * Default: the direction of the nearest ancestor with `dir`, or right to left.
   */
  dir?: "rtl" | "ltr";
}

/** Up to this many pages the bar is drawn as one segment per page. */
const MAX_SEGMENTS = 40;

/**
 * The reading progress bar, which is also a slider: tap or drag along it to
 * move to another page. While dragging a bubble shows the page that will open;
 * the page turns when the finger lifts. Keys are handled by the reader itself
 * (arrows, Home, End), so the slider only describes its value.
 */
export function ProgressScrubber({ index, pageCount, onJump, dir }: ProgressScrubberProps) {
  const locale = useLocale();
  const t = READER_MESSAGES[locale];
  const trackRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const percent = progressPercent(index, pageCount);
  const current = clamp(index, 0, pageCount - 1);

  function pageAt(clientX: number): number {
    const track = trackRef.current;
    if (!track || pageCount <= 0) return current;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return current;
    // The site is Hebrew: right to left unless an ancestor (or the track itself) says otherwise.
    const rtl = (track.closest("[dir]")?.getAttribute("dir") || document.documentElement.dir || "rtl") !== "ltr";
    const fraction = rtl ? (rect.right - clientX) / rect.width : (clientX - rect.left) / rect.width;
    return clamp(Math.floor(fraction * pageCount), 0, pageCount - 1);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPreview(pageAt(event.clientX));
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (preview === null) return;
    setPreview(pageAt(event.clientX));
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (preview === null) return;
    const target = pageAt(event.clientX);
    setPreview(null);
    if (target !== index) onJump(target);
  }

  const shown = preview ?? current;
  const fillPercent = preview === null ? percent : progressPercent(preview, pageCount);
  const segments = pageCount > 1 && pageCount <= MAX_SEGMENTS ? pageCount : 0;

  return (
    <div
      ref={trackRef}
      dir={dir}
      role="slider"
      tabIndex={0}
      aria-label={t.scrubber.label}
      aria-valuemin={1}
      aria-valuemax={Math.max(pageCount, 1)}
      aria-valuenow={index >= pageCount ? pageCount : index + 1}
      aria-valuetext={index >= pageCount ? t.player.theEnd : t.player.pageOf(index + 1, pageCount)}
      className="group relative mx-3 shrink-0 cursor-pointer touch-none select-none py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent sm:mx-5"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setPreview(null)}
    >
      <div
        className={cn(
          "relative h-2 overflow-hidden rounded-full bg-surface-2/80 transition-[height] duration-150 group-hover:h-3",
          preview !== null && "h-3",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full from-accent to-primary",
            dir === "ltr" ? "bg-gradient-to-r" : "bg-gradient-to-l",
            preview === null && "transition-[width] duration-300",
          )}
          style={{ width: `${fillPercent}%` }}
        />
        {segments > 0 ? (
          <div className="pointer-events-none absolute inset-0 flex" aria-hidden="true">
            {Array.from({ length: segments }, (_, page) => (
              <span key={page} className="h-full flex-1 border-e-2 border-background last:border-e-0" />
            ))}
          </div>
        ) : null}
      </div>
      {preview !== null ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-full z-30 mt-1 whitespace-nowrap rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background shadow-pop",
            // With a known direction the shift is chosen here: rtl:/ltr: variants also match an
            // outer page of the other direction (an English interface around a Hebrew book).
            dir === undefined ? "-translate-x-1/2 rtl:translate-x-1/2" : dir === "rtl" ? "translate-x-1/2" : "-translate-x-1/2",
          )}
          style={{ insetInlineStart: `${((shown + 0.5) / pageCount) * 100}%` }}
        >
          {t.player.pageOf(shown + 1, pageCount)}
        </span>
      ) : null}
    </div>
  );
}
