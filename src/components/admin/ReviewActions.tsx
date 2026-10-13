"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { REVIEW_NOTE_MAX } from "@/app/admin/_lib/schemas";
import { Button, Dialog, Field, Textarea } from "@/components/ui";
import { adminRequest } from "./request";

export interface ReviewActionsProps {
  bookId: string;
  title: string;
  /** Reasons the book cannot be published yet; approving is disabled while there are any. */
  blockers: string[];
  /** Missing credits. They block approval too, unless the viewer is an admin who confirms. */
  missingCredits?: string[];
  /** The viewer is an admin and may publish although credits are missing. */
  canWaiveCredits?: boolean;
  /** Where to go after a decision. Default: refresh the current page. */
  afterHref?: string;
  /**
   * `updatedAt` of the book as this page shows it. Sent with an approval, so
   * the server refuses to publish a book that changed after the editor read it.
   */
  updatedAt?: string;
}

type ReviewBody =
  { action: "approve"; updatedAt?: string; waiveCredits?: boolean } | { action: "reject"; note: string };

/** Approve / reject buttons for a book that waits in the approval queue. */
export function ReviewActions({
  bookId,
  title,
  blockers,
  missingCredits = [],
  canWaiveCredits = false,
  afterHref,
  updatedAt,
}: ReviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const needsWaiver = missingCredits.length > 0;
  const [note, setNote] = useState("");
  const noteId = `reject-note-${bookId}`;
  const noteValid = note.trim().length >= 3;

  async function send(body: ReviewBody) {
    setBusy(body.action);
    setError(null);
    const result = await adminRequest(adminApi.bookReview(bookId), "POST", body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRejectOpen(false);
    setWaiveOpen(false);
    setNote("");
    if (afterHref) router.push(afterHref);
    router.refresh();
  }

  function closeReject() {
    if (busy) return;
    setRejectOpen(false);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "approve"}
          disabled={busy !== null || blockers.length > 0 || (needsWaiver && !canWaiveCredits)}
          onClick={() => {
            if (needsWaiver) {
              setError(null);
              setWaiveOpen(true);
            } else send({ action: "approve", ...(updatedAt ? { updatedAt } : {}) });
          }}
        >
          {needsWaiver && canWaiveCredits && blockers.length === 0 ? "פרסום למרות הפרטים החסרים" : "אישור ופרסום"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => {
            setError(null);
            setRejectOpen(true);
          }}
        >
          החזרה ליוצר
        </Button>
      </div>
      {blockers.length > 0 || needsWaiver ? (
        <ul className="text-sm font-medium text-warning">
          {[...blockers, ...missingCredits].map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
          {needsWaiver && !canWaiveCredits ? <li>רק מנהל יכול לפרסם ספר שחסרים בו פרטים.</li> : null}
        </ul>
      ) : null}
      {error && !rejectOpen && !waiveOpen ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Dialog
        open={waiveOpen}
        onClose={() => {
          if (!busy) setWaiveOpen(false);
        }}
        title="פרסום עם פרטים חסרים"
        description={`"${title}" יפורסם בספרייה הציבורית למרות שחסרים בו פרטים. אפשר להשלים אותם גם אחרי הפרסום.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setWaiveOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="secondary"
              loading={busy === "approve"}
              onClick={() =>
                send({
                  action: "approve",
                  waiveCredits: true,
                  ...(updatedAt ? { updatedAt } : {}),
                })
              }
            >
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

      <Dialog
        open={rejectOpen}
        onClose={closeReject}
        title="החזרת הספר ליוצר"
        description={`"${title}" יחזור למצב פרטי, והיוצר יראה את ההערה.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy !== null} onClick={closeReject}>
              ביטול
            </Button>
            <Button
              variant="danger"
              loading={busy === "reject"}
              disabled={!noteValid}
              onClick={() => send({ action: "reject", note: note.trim() })}
            >
              החזרה עם הערה
            </Button>
          </>
        }
      >
        <Field
          label="מה צריך לתקן?"
          htmlFor={noteId}
          required
          hint="לפחות שלושה תווים. ההערה נשמרת בספר."
          error={error ?? undefined}
        >
          <Textarea
            id={noteId}
            value={note}
            maxLength={REVIEW_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby={error ? `${noteId}-error` : `${noteId}-hint`}
          />
        </Field>
      </Dialog>
    </div>
  );
}
