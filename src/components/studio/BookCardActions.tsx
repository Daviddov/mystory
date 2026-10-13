"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Dialog } from "@/components/ui";
import { routes } from "@/lib/routes";
import { deleteBook, StudioApiError } from "@/lib/studio/client";

export interface BookCardActionsProps {
  bookId: string;
  title: string;
  /** False for a published book the user may not delete directly. */
  canDelete: boolean;
}

/** Edit and delete buttons under a book in the "my books" list. */
export function BookCardActions({ bookId, title, canDelete }: BookCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteBook(bookId);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : "מחיקת הספר נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <ButtonLink href={routes.studioBook(bookId)} variant="outline" size="sm" className="flex-1">
        <Pencil aria-hidden="true" className="size-4" />
        עריכה
      </ButtonLink>
      {canDelete ? (
        <Button variant="ghost" size="sm" aria-label={`מחיקת הספר ${title}`} onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" className="size-4 text-danger" />
        </Button>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="למחוק את הספר?"
        description={`הספר "${title}", התמונות וההקלטות שלו יימחקו לצמיתות.`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              ביטול
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              מחיקת הספר
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
