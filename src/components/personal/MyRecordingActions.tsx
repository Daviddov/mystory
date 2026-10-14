"use client";

import { Send, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { deleteRecordingRequest, shareRecordingRequest, type RecordingView } from "@/lib/recordings/client";

export interface MyRecordingActionsProps {
  id: string;
  title: string;
  status: RecordingView["status"];
  /** Sharing is possible: the book is published and something was recorded. */
  canShare: boolean;
}

/** Share, stop sharing or delete one of the reader's own recordings (on "המדף שלי"). */
export function MyRecordingActions({ id, title, status, canShare }: MyRecordingActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error ?? null);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {status === "private" && canShare ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => shareRecordingRequest(id, "submit"))}
          >
            <Send aria-hidden="true" className="size-4" />
            לשתף עם כולם
          </Button>
        ) : null}
        {status !== "private" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => shareRecordingRequest(id, "withdraw"))}
          >
            <Undo2 aria-hidden="true" className="size-4" />
            להפסיק לשתף
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`למחוק את ההקלטה "${title}"? אי אפשר לבטל את המחיקה.`)) {
              void run(() => deleteRecordingRequest(id));
            }
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          מחיקה
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
