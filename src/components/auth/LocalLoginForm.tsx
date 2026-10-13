"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { loginAction, type LoginState } from "@/lib/auth/actions";

const INITIAL: LoginState = {};

/** Development login form: name and optional email, no password. */
export function LocalLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="שם" htmlFor="login-name" required>
        <Input id="login-name" name="name" autoComplete="name" required maxLength={100} />
      </Field>
      <Field
        label="אימייל"
        htmlFor="login-email"
        hint="לא חובה. אותו אימייל מחזיר אתכם לאותו חשבון."
      >
        <Input id="login-email" name="email" type="email" dir="ltr" autoComplete="email" />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 font-medium">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending}>
        כניסה
      </Button>
    </form>
  );
}
