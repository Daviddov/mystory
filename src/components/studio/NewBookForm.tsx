"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Field, Input, Select } from "@/components/ui";
import { taxonomyText } from "@/lib/i18n/messages";
import { STUDIO_NEW_BOOK } from "@/lib/i18n/studio";
import { routes } from "@/lib/routes";
import { createBook, StudioApiError } from "@/lib/studio/client";
import { AGE_GROUP_INFO } from "@/lib/taxonomy";
import type { AgeGroup } from "@/lib/types";

/** The only two questions before the editor opens: a name and an age group. */
export function NewBookForm() {
  const router = useRouter();
  const locale = useLocale();
  const t = STUDIO_NEW_BOOK[locale];
  const [title, setTitle] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("3-5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const name = title.trim();
    if (!name) {
      setError(t.missingTitle);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const book = await createBook({ title: name, ageGroup });
      router.push(routes.studioBook(book.id));
    } catch (err) {
      setError(err instanceof StudioApiError ? err.message : t.createFailed);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field label={t.titleLabel} htmlFor="new-book-title" required error={error ?? undefined}>
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
      <Field label={t.ageLabel} htmlFor="new-book-age">
        <Select id="new-book-age" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as AgeGroup)}>
          {AGE_GROUP_INFO.map((age) => {
            const text = taxonomyText(locale, "age", age.slug, age);
            return (
              <option key={age.slug} value={age.slug}>
                {text.label}: {text.description}
              </option>
            );
          })}
        </Select>
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        {t.submit}
      </Button>
    </form>
  );
}
