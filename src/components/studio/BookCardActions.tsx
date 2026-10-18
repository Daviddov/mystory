"use client";

import { Pencil, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Dialog } from "@/components/ui";
import { routes } from "@/lib/routes";
import { createShareLink, deleteBook, StudioApiError } from "@/lib/studio/client";

export interface BookCardActionsProps {
  bookId: string;
  title: string;
  /** False for a published book the user may not delete directly. */
  canDelete: boolean;
  /** The book's existing share-link token, if any. */
  shareToken?: string;
}

/** Edit, share and delete buttons under a book in the "my books" list. */
export function BookCardActions({ bookId, title, canDelete, shareToken }: BookCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  /** Creates the share link when missing, then opens the native share sheet or copies the link. */
  const share = async () => {
    setSharing(true);
    setShareNote(null);
    try {
      const token = shareToken ?? (await createShareLink(bookId)).shareToken;
      if (!token) throw new Error("no token");
      const url = new URL(routes.share(token), window.location.origin).toString();
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title, url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      setShareNote("הקישור הועתק");
      router.refresh();
    } catch (err) {
      setShareNote(err instanceof StudioApiError ? err.message : "יצירת הקישור נכשלה");
    } finally {
      setSharing(false);
    }
  };

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
    <div className="flex flex-wrap items-center gap-2">
      <ButtonLink href={routes.studioBook(bookId)} variant="outline" size="sm" className="flex-1">
        <Pencil aria-hidden="true" className="size-4" />
        עריכה
      </ButtonLink>
      <Button variant="ghost" size="sm" aria-label={`שיתוף הספר ${title}`} onClick={share} loading={sharing}>
        <Share2 aria-hidden="true" className="size-4" />
      </Button>
      {shareNote ? (
        <p role="status" className="w-full text-sm text-muted">
          {shareNote}
        </p>
      ) : null}
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
