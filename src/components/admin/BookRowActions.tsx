"use client";

import { Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABELS } from "@/app/admin/_lib/labels";
import { adminApi } from "@/app/admin/_lib/paths";
import { Button, Dialog, Select } from "@/components/ui";
import { BOOK_STATUSES, type BookStatus } from "@/lib/types";
import { adminRequest } from "./request";

export interface BookRowActionsProps {
  bookId: string;
  title: string;
  status: BookStatus;
  isBookOfTheWeek: boolean;
  /** Where to go after deleting. Default: refresh the current page. */
  afterDeleteHref?: string;
  /** Credits the book lacks; publishing it then needs an admin's confirmation. */
  missingCredits?: string[];
  /** The viewer is an admin and may publish although credits are missing. */
  canWaiveCredits?: boolean;
}

type Message = { kind: "error" | "info"; text: string };

/** Status select, "book of the week" toggle and delete (with confirmation) for one book. */
export function BookRowActions({
  bookId,
  title,
  status,
  isBookOfTheWeek,
  afterDeleteHref,
  missingCredits = [],
  canWaiveCredits = false,
}: BookRowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);

  async function changeStatus(next: BookStatus, waiveCredits = false) {
    if (next === status) return;
    if (next === "published" && missingCredits.length > 0 && canWaiveCredits && !waiveCredits) {
      setMessage(null);
      setWaiveOpen(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await adminRequest<{ clearedBookOfTheWeek: boolean }>(adminApi.book(bookId), "PATCH", {
      status: next,
      ...(waiveCredits ? { waiveCredits: true } : {}),
    });
    setBusy(false);
    setWaiveOpen(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    if (result.data.clearedBookOfTheWeek) {
      setMessage({ kind: "info", text: "הספר היה ספר השבוע, והבחירה בוטלה." });
    }
    router.refresh();
  }

  async function setWeekly(id: string | null) {
    setBusy(true);
    setMessage(null);
    const result = await adminRequest(adminApi.settings(), "PUT", {
      bookOfTheWeekId: id,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    const result = await adminRequest<{ mediaDeleted: boolean }>(adminApi.book(bookId), "DELETE");
    setBusy(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setConfirmOpen(false);
    if (afterDeleteHref) router.push(afterDeleteHref);
    router.refresh();
  }

  function closeConfirm() {
    if (busy) return;
    setConfirmOpen(false);
    setMessage(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Controlled by the server value, so after a refused change it snaps back. */}
        <Select
          aria-label={`סטטוס הספר ${title}`}
          value={status}
          disabled={busy}
          onChange={(event) => changeStatus(event.target.value as BookStatus)}
          className="min-h-10 w-auto px-3 text-sm"
        >
          {BOOK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {status === "published" ? (
          <Button
            size="icon"
            variant={isBookOfTheWeek ? "accent" : "ghost"}
            disabled={busy}
            aria-pressed={isBookOfTheWeek}
            aria-label={`${title}: ספר השבוע`}
            title={isBookOfTheWeek ? "ספר השבוע (לחיצה מבטלת)" : "בחירה כספר השבוע"}
            onClick={() => setWeekly(isBookOfTheWeek ? null : bookId)}
          >
            <Star aria-hidden="true" className={isBookOfTheWeek ? "fill-current" : undefined} />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          disabled={busy}
          aria-label={`מחיקת הספר ${title}`}
          title="מחיקה"
          onClick={() => {
            setMessage(null);
            setConfirmOpen(true);
          }}
          className="text-danger"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      {message && !confirmOpen && !waiveOpen ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error" ? "max-w-xs text-sm font-medium text-danger" : "max-w-xs text-sm text-muted"
          }
        >
          {message.text}
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
            <Button variant="secondary" loading={busy} onClick={() => changeStatus("published", true)}>
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
        {message?.kind === "error" ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {message.text}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={closeConfirm}
        size="sm"
        title="למחוק את הספר?"
        description={`"${title}" יימחק לצמיתות, כולל האיורים, ההקלטות, המועדפים וההתקדמות של הקוראים. אי אפשר לבטל את המחיקה.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={closeConfirm}>
              ביטול
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              מחיקה לצמיתות
            </Button>
          </>
        }
      >
        {message?.kind === "error" ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {message.text}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
