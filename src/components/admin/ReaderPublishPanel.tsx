"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { ButtonLink, Button, Dialog } from "@/components/ui";
import { routes } from "@/lib/routes";
import type { BookStatus } from "@/lib/types";
import { adminRequest } from "./request";

export interface ReaderPublishPanelProps {
  bookId: string;
  slug: string;
  title: string;
  status: Exclude<BookStatus, "published">;
  /** Reasons the book cannot be published at all (see publishBlockers). */
  blockers: string[];
  /** Missing credits. They block publication too, unless the viewer is an admin who confirms. */
  missingCredits: string[];
  /** The viewer is an admin and may publish although credits are missing. */
  canWaiveCredits: boolean;
  /** `updatedAt` of the book as read, so a book that changed meanwhile is not approved blindly. */
  updatedAt: string;
}

/**
 * "Publish now" on the reader's end screen, for an editor who has just read an
 * unpublished book. A book in the approval queue goes through the review
 * endpoint (approval); any other status is changed directly.
 */
export function ReaderPublishPanel({
  bookId,
  slug,
  title,
  status,
  blockers,
  missingCredits,
  canWaiveCredits,
  updatedAt,
}: ReaderPublishPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const needsWaiver = missingCredits.length > 0;
  const blocked = blockers.length > 0 || (needsWaiver && !canWaiveCredits);

  async function publish(waiveCredits: boolean) {
    setBusy(true);
    setError(null);
    const extra = waiveCredits ? { waiveCredits: true } : {};
    const result =
      status === "pending"
        ? await adminRequest(adminApi.bookReview(bookId), "POST", { action: "approve", updatedAt, ...extra })
        : await adminRequest(adminApi.book(bookId), "PATCH", { status: "published", ...extra });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWaiveOpen(false);
    setPublished(true);
  }

  if (published) {
    return (
      <section role="status" className="rounded-xl bg-surface p-6 text-center shadow-card">
        <p className="text-2xl font-bold">
          <span aria-hidden="true">✅ </span>
          הספר פורסם בספרייה
        </p>
        <div className="mt-4 flex justify-center">
          <ButtonLink href={routes.book(slug)} variant="outline">
            לעמוד הספר
          </ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="reader-publish-title"
      className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-surface p-6 text-center shadow-card"
    >
      <h3 id="reader-publish-title" className="text-2xl font-bold">
        {status === "pending" ? "הספר ממתין לאישור" : "הספר עדיין לא פורסם"}
      </h3>
      <p className="text-muted">קראתם אותו עד הסוף. אפשר לפרסם אותו עכשיו בספרייה הציבורית.</p>
      <Button
        size="lg"
        variant="secondary"
        loading={busy && !waiveOpen}
        disabled={busy || blocked}
        onClick={() => {
          if (needsWaiver) {
            setError(null);
            setWaiveOpen(true);
          } else publish(false);
        }}
      >
        <Send aria-hidden="true" />
        {needsWaiver && !blocked ? "פרסום למרות הפרטים החסרים" : "פרסום הספר"}
      </Button>
      {blockers.length > 0 || needsWaiver ? (
        <ul className="text-sm font-medium text-warning">
          {[...blockers, ...missingCredits].map((item) => (
            <li key={item}>{item}</li>
          ))}
          {needsWaiver && !canWaiveCredits ? <li>רק מנהל יכול לפרסם ספר שחסרים בו פרטים.</li> : null}
        </ul>
      ) : null}
      {error && !waiveOpen ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Dialog
        open={waiveOpen}
        onClose={() => {
          if (!busy) setWaiveOpen(false);
        }}
        size="sm"
        title="פרסום עם פרטים חסרים"
        description={`"${title}" יפורסם בספרייה הציבורית למרות שחסרים בו פרטים. אפשר להשלים אותם גם אחרי הפרסום.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setWaiveOpen(false)}>
              ביטול
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => publish(true)}>
              לפרסם בכל זאת
            </Button>
          </>
        }
      >
        <ul className="list-disc ps-5">
          {missingCredits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}
