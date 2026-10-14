"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { REVIEW_NOTE_MAX } from "@/app/admin/_lib/schemas";
import { Button, Dialog, Field, Textarea } from "@/components/ui";
import { adminRequest } from "./request";

export interface RecordingReviewActionsProps {
  recordingId: string;
  title: string;
  /** `updatedAt` of the recording as listened to; approval is refused if it changed since. */
  updatedAt: string;
}

/** Approve / return buttons for a family recording that waits for sharing. */
export function RecordingReviewActions({ recordingId, title, updatedAt }: RecordingReviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteId = `recording-note-${recordingId}`;

  async function send(body: { action: "approve"; updatedAt: string } | { action: "reject"; note: string }) {
    setBusy(body.action);
    setError(null);
    const result = await adminRequest(adminApi.recordingReview(recordingId), "POST", body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRejectOpen(false);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "approve"}
          disabled={busy !== null}
          onClick={() => send({ action: "approve", updatedAt })}
        >
          אישור ושיתוף
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
          החזרה למקליט
        </Button>
      </div>
      {error && !rejectOpen ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Dialog
        open={rejectOpen}
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
        title="החזרת ההקלטה"
        description={`"${title}" לא תשותף, והמקליט יראה את ההערה במדף שלו.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setRejectOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="danger"
              loading={busy === "reject"}
              disabled={note.trim().length < 3}
              onClick={() => send({ action: "reject", note: note.trim() })}
            >
              החזרה עם הערה
            </Button>
          </>
        }
      >
        <Field
          label="למה ההקלטה לא מתאימה?"
          htmlFor={noteId}
          required
          hint="לפחות שלושה תווים."
          error={error ?? undefined}
        >
          <Textarea
            id={noteId}
            value={note}
            maxLength={REVIEW_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </Dialog>
    </div>
  );
}
