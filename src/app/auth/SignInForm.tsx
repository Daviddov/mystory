"use client";

import { useActionState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Field, Input } from "@/components/ui";
import { accountMessages } from "@/lib/i18n/account";
import { googleSignInAction, sendMagicLinkAction, type SignInState } from "./actions";

const INITIAL: SignInState = {};

/**
 * Supabase sign-in: a one-time link by email, or Google. `next` must already
 * be a sanitized same-site path (see safeNextPath).
 */
export function SignInForm({ next, error }: { next: string; error?: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLinkAction, INITIAL);
  const message = state.error ?? error;
  const t = accountMessages(useLocale()).auth;

  if (state.sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md bg-success-soft px-4 py-4">
        <p className="text-xl font-bold">{t.sentTitle}</p>
        <p>
          {t.sentBefore}{" "}
          <bdi dir="ltr" className="font-medium">
            {state.sentTo}
          </bdi>
          {t.sentAfter}
        </p>
        <p className="text-muted">{t.notArrived}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 font-medium">
          {message}
        </p>
      ) : null}

      <form action={googleSignInAction}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" size="lg" variant="outline" fullWidth>
          {t.google}
        </Button>
      </form>

      <p className="text-center text-muted" aria-hidden="true">
        {t.or}
      </p>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />
        <Field label={t.email} htmlFor="sign-in-email" hint={t.emailHint} required>
          <Input
            id="sign-in-email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
          />
        </Field>
        <Button type="submit" size="lg" loading={pending}>
          {t.sendLink}
        </Button>
      </form>
    </div>
  );
}
