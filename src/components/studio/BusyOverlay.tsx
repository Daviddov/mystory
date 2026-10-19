"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { OVERDUE_TEXT, elapsedText, progressView, remainingText, valueText, type BusyState } from "@/lib/studio/progress";

/**
 * Blocks the editor while an AI call runs and shows how far it is: the step,
 * an accessible progress bar with percent, the elapsed seconds and, when known,
 * the time left. Moves focus into itself (the page behind is inert) and gives
 * it back when the work is done.
 */
export function BusyOverlay({ busy }: { busy: BusyState }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" data-testid="busy-overlay">
      <div
        ref={box}
        tabIndex={-1}
        role="group"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg bg-surface px-6 py-5 shadow-pop outline-none"
      >
        <div className="flex items-center gap-3 text-lg font-semibold">
          <Spinner label="" />
          <p id={titleId} role="status">
            {busy.label}
          </p>
        </div>
        {/* A new step restarts the step clock (key) while the overall clock keeps running. */}
        <Meter key={busy.steps ? busy.steps.done : -1} busy={busy} startedAt={startedAt} labelledBy={titleId} />
      </div>
    </div>
  );
}

function Meter({ busy, startedAt, labelledBy }: { busy: BusyState; startedAt: number; labelledBy: string }) {
  const [stepStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(stepStartedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const stepElapsed = Math.max(0, (now - stepStartedAt) / 1000);
  const view = progressView(busy, elapsed, stepElapsed);
  const determinate = view.value !== null;
  const detail = view.overdue
    ? OVERDUE_TEXT
    : view.remainingSeconds !== null && elapsed >= 1
      ? remainingText(view.remainingSeconds)
      : null;

  return (
    <>
      <div
        role="progressbar"
        aria-labelledby={labelledBy}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(determinate ? { "aria-valuenow": view.percent ?? 0, "aria-valuetext": valueText(view) } : { "aria-valuetext": "בתהליך" })}
        className="relative h-3 w-full overflow-hidden rounded-full bg-border"
      >
        {determinate ? (
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none",
              view.overdue && "motion-safe:animate-pulse",
            )}
            style={{ width: `${view.percent ?? 0}%` }}
          />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse" />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <span>{view.percent !== null ? `${view.percent}%` : "מעבדים…"}</span>
        <span>{detail ?? ""}</span>
        <span>{elapsedText(elapsed)}</span>
      </div>
    </>
  );
}
