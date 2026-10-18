"use client";

import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export interface StarRatingProps {
  bookId: string;
  initialAverage: number;
  initialCount: number;
  /** The signed-in user's own rating, if any. */
  initialMine: number | null;
  signedIn: boolean;
  /** Login page URL that returns to this book. */
  loginHref: string;
  className?: string;
}

const STARS = [1, 2, 3, 4, 5] as const;

interface RatingState {
  average: number;
  count: number;
  mine: number | null;
}

/**
 * Average rating of a book, and for signed-in readers five stars to set their own.
 * Pressing the star you already gave removes your rating.
 */
export function StarRating({
  bookId,
  initialAverage,
  initialCount,
  initialMine,
  signedIn,
  loginHref,
  className,
}: StarRatingProps) {
  const [state, setState] = useState<RatingState>({ average: initialAverage, count: initialCount, mine: initialMine });
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);

  async function choose(stars: number) {
    if (busy) return;
    setBusy(true);
    setProblem(false);
    try {
      const remove = state.mine === stars;
      const response = await fetch(`/api/ratings/${encodeURIComponent(bookId)}`, {
        method: remove ? "DELETE" : "PUT",
        headers: { "content-type": "application/json" },
        body: remove ? undefined : JSON.stringify({ stars }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as RatingState;
      setState({ average: data.average, count: data.count, mine: data.mine });
    } catch {
      setProblem(true);
    } finally {
      setBusy(false);
    }
  }

  const shown = hover ?? state.mine ?? Math.round(state.average);
  const summary = state.count
    ? `ציון ממוצע ${state.average.toFixed(1)} מתוך 5, לפי ${state.count} ${state.count === 1 ? "דירוג" : "דירוגים"}`
    : "עוד אין דירוגים";

  return (
    <div className={cn("flex flex-col gap-1", className)} data-testid="star-rating">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={signedIn ? "הדירוג שלך לספר" : "דירוג הספר"}
          className="flex items-center gap-1"
          dir="rtl"
          onMouseLeave={() => setHover(null)}
        >
          {STARS.map((n) => {
            const icon = (
              <Star
                aria-hidden="true"
                className={cn("size-8", n <= shown ? "fill-warning text-warning" : "text-muted")}
              />
            );
            // Signed-out readers see the average with no login wall; pressing a star takes them to sign-in.
            return (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => (signedIn ? void choose(n) : router.push(loginHref))}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(null)}
                aria-pressed={signedIn ? state.mine === n : undefined}
                aria-label={`${n} ${n === 1 ? "כוכב" : "כוכבים"}${signedIn ? "" : " (נדרשת התחברות)"}`}
                className="inline-flex size-touch items-center justify-center rounded-full transition-transform hover:bg-surface-2 active:scale-95"
              >
                {icon}
              </button>
            );
          })}
        </div>
        <p className="text-lg" aria-live="polite">
          {state.count ? (
            <>
              <span className="font-bold tabular-nums">{state.average.toFixed(1)}</span>{" "}
              <span className="text-muted">({state.count})</span>
            </>
          ) : (
            <span className="text-muted">עוד אין דירוגים</span>
          )}
        </p>
      </div>
      <p className="sr-only">{summary}</p>
      {signedIn ? (
        <p className="text-sm text-muted">
          {state.mine ? "דירגתם את הספר. לחיצה על אותו כוכב מבטלת את הדירוג." : "אהבתם? דרגו את הספר."}
        </p>
      ) : (
        <p className="text-sm text-muted">כדי לדרג את הספר צריך להתחבר.</p>
      )}
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          לא הצלחנו לשמור את הדירוג. נסו שוב.
        </p>
      ) : null}
    </div>
  );
}
