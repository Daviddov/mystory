"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { routes } from "@/lib/routes";
import { createBook, StudioApiError } from "@/lib/studio/client";
import { AGE_GROUP_INFO } from "@/lib/taxonomy";
import type { AgeGroup } from "@/lib/types";

/** The only two questions before the editor opens: a name and an age group. */
export function NewBookForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("3-5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const name = title.trim();
    if (!name) {
      setError("כתבו שם לספר. אפשר לשנות אותו אחר כך.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const book = await createBook({ title: name, ageGroup });
      router.push(routes.studioBook(book.id));
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : "יצירת הספר נכשלה");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field label="שם הספר" htmlFor="new-book-title" required error={error ?? undefined}>
        <Input
          id="new-book-title"
          value={title}
          maxLength={200}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-book-title-error" : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label="לאיזה גיל?" htmlFor="new-book-age">
        <Select id="new-book-age" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as AgeGroup)}>
          {AGE_GROUP_INFO.map((age) => (
            <option key={age.slug} value={age.slug}>
              {age.label}: {age.description}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        יצירת הספר ומעבר לעריכה
      </Button>
    </form>
  );
}
