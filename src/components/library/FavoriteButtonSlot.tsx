"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Endpoint owned by the personal-area module: POST adds, DELETE removes. */
export function favoriteApiUrl(bookId: string): string {
  return `/api/favorites/${encodeURIComponent(bookId)}`;
}

export interface FavoriteButtonSlotProps {
  bookId: string;
  /** Whether the book is already a favorite of the signed-in user (known on the server). */
  initialFavorite?: boolean;
  /** False when the server already knows nobody is signed in: the button becomes a login link. */
  signedIn?: boolean;
  /** Login page URL that returns to this book. */
  loginHref: string;
  className?: string;
}

type Problem = "login" | "unavailable" | "failed" | null;

/**
 * FAVORITE BUTTON SLOT of the book page.
 *
 * Talks only to POST / DELETE /api/favorites/[bookId] and tolerates the
 * endpoint being absent or refusing:
 *   401 / 403 -> asks the reader to sign in
 *   404 / 405 -> says favorites are not available (the API may not be installed)
 *   other     -> says saving failed
 * The heart is only shown as filled after the server confirmed the change.
 */
export function FavoriteButtonSlot({
  bookId,
  initialFavorite = false,
  signedIn = true,
  loginHref,
  className,
}: FavoriteButtonSlotProps) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const classes = buttonClasses({ variant: "outline", size: "lg", className: "w-full sm:w-auto" });

  if (!signedIn) {
    return (
      <div className={cn("flex flex-col gap-2", className)} data-slot="favorite-button">
        <Link href={loginHref} className={classes}>
          <Heart aria-hidden="true" />
          שמירה במועדפים
        </Link>
        <p className="text-sm text-muted">כדי לשמור ספרים במועדפים צריך להתחבר.</p>
      </div>
    );
  }

  async function toggle() {
    if (busy) return;
    const wanted = !favorite;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(favoriteApiUrl(bookId), {
        method: wanted ? "POST" : "DELETE",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (response.ok) setFavorite(wanted);
      else if (response.status === 401 || response.status === 403) setProblem("login");
      else if (response.status === 404 || response.status === 405) setProblem("unavailable");
      else setProblem("failed");
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="favorite-button">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={favorite}
        aria-busy={busy || undefined}
        disabled={busy}
        className={classes}
      >
        <Heart aria-hidden="true" className={cn(favorite && "fill-danger text-danger")} />
        {favorite ? "במועדפים שלי" : "שמירה במועדפים"}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
        {problem === "login" ? (
          <>
            כדי לשמור במועדפים צריך{" "}
            <Link href={loginHref} className="font-semibold text-secondary underline underline-offset-4">
              להתחבר
            </Link>
            .
          </>
        ) : problem === "unavailable" ? (
          "המועדפים לא זמינים כרגע, והספר לא נשמר."
        ) : problem === "failed" ? (
          "לא הצלחנו לעדכן את המועדפים. נסו שוב בעוד רגע."
        ) : null}
      </p>
    </div>
  );
}
