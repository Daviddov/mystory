"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { WAITLIST_INTERESTS, type WaitlistInterest } from "@/lib/types";

const LABELS: Record<WaitlistInterest, string> = {
  credits: "חבילת ספרים נוספים אחרי הספר החינמי השבועי",
  "personal-book": "ספר אישי עם השם והתמונה של הילד, כמתנה",
  print: "ספר מודפס שמגיע עד הבית",
};

/** Leaves an e-mail on the waiting list. Nothing is charged; it only measures interest. */
export function WaitlistForm({ defaultInterests = ["credits"] }: { defaultInterests?: WaitlistInterest[] }) {
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<WaitlistInterest[]>(defaultInterests);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggle(interest: WaitlistInterest) {
    setInterests((current) =>
      current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (interests.length === 0) {
      setError("בחרו לפחות דבר אחד שמעניין אתכם.");
      return;
    }
    setError(null);
    setState("sending");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, interests }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(response.status === 400 ? "כתובת המייל אינה תקינה." : (body?.error ?? "משהו השתבש. נסו שוב."));
      }
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש. נסו שוב.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="rounded-lg bg-surface-2 p-5 text-lg font-semibold">
        תודה! רשמנו אתכם. נשלח מייל אחד כשזה יהיה מוכן, ולא יותר.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold">מה מעניין אתכם?</legend>
        {WAITLIST_INTERESTS.map((interest) => (
          <label key={interest} className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="size-5"
              checked={interests.includes(interest)}
              onChange={() => toggle(interest)}
            />
            {LABELS[interest]}
          </label>
        ))}
      </fieldset>
      <Field label="המייל שלכם" htmlFor="waitlist-email" error={error} required>
        <Input
          id="waitlist-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "waitlist-email-error" : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={state === "sending"}>
        {state === "sending" ? "שולחים…" : "עדכנו אותי"}
      </Button>
      <p className="text-sm text-muted">אין חיוב ואין התחייבות. המייל משמש רק לעדכון על זה, ולא נעביר אותו הלאה.</p>
    </form>
  );
}
