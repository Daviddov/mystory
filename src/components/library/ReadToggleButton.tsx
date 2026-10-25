"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ReadToggleButtonProps {
  bookId: string;
  /** Whether the signed-in user already finished the book (known on the server). */
  initialRead: boolean;
  /** Zero-based page the user stopped at; kept when the mark changes. */
  pageIndex?: number;
  className?: string;
}

/** Marks a book as read / not read for the signed-in user (POST /api/progress). */
export function ReadToggleButton({ bookId, initialRead, pageIndex = 0, className }: ReadToggleButtonProps) {
  const [read, setRead] = useState(initialRead);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (busy) return;
    const wanted = !read;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ bookId, pageIndex, completed: wanted }),
      });
      if (response.ok) setRead(wanted);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="read-toggle">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={read}
        aria-busy={busy || undefined}
        disabled={busy}
        className={buttonClasses({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}
      >
        <Check aria-hidden="true" className={cn(read && "text-primary")} />
        {read ? "קראתי את הספר" : "סימון כנקרא"}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
        {failed ? "לא הצלחנו לעדכן. נסו שוב בעוד רגע." : null}
      </p>
    </div>
  );
}
