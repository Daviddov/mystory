"use client";

import { useActionState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Field, Input } from "@/components/ui";
import { accountMessages } from "@/lib/i18n/account";
import { loginAction, type LoginState } from "@/lib/auth/actions";

const INITIAL: LoginState = {};

/** Development login form: name and optional email, no password. */
export function LocalLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  const t = accountMessages(useLocale()).auth;
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label={t.name} htmlFor="login-name" required>
        <Input id="login-name" name="name" autoComplete="name" required maxLength={100} />
      </Field>
      <Field label={t.email} htmlFor="login-email" hint={t.localEmailHint}>
        <Input id="login-email" name="email" type="email" dir="ltr" autoComplete="email" />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 font-medium">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending}>
        {t.signIn}
      </Button>
    </form>
  );
}
