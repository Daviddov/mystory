"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { Button, Field, Select } from "@/components/ui";
import { adminRequest } from "./request";

export interface BookOfWeekPickerProps {
  /** Published books only. */
  books: { id: string; title: string }[];
  currentId: string | null;
}

export function BookOfWeekPicker({ books, currentId }: BookOfWeekPickerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "info";
    text: string;
  } | null>(null);
  const dirty = selected !== (currentId ?? "");

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await adminRequest(adminApi.settings(), "PUT", {
      bookOfTheWeekId: selected || null,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setMessage({
      kind: "info",
      text: selected ? "ספר השבוע עודכן." : "ספר השבוע בוטל.",
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="ספר השבוע" htmlFor="book-of-the-week" hint="מוצג בראש עמוד הבית. אפשר לבחור רק ספר מפורסם.">
        <div className="flex flex-wrap gap-3">
          <Select
            id="book-of-the-week"
            value={selected}
            disabled={busy}
            onChange={(event) => {
              setSelected(event.target.value);
              setMessage(null);
            }}
            aria-describedby="book-of-the-week-hint"
            className="min-w-56 flex-1"
          >
            <option value="">בלי ספר השבוע</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </Select>
          <Button onClick={save} loading={busy} disabled={!dirty}>
            שמירה
          </Button>
        </div>
      </Field>
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={message.kind === "error" ? "text-sm font-medium text-danger" : "text-sm font-medium text-success"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
