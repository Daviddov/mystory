"use client";

import { useActionState, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountMessages } from "@/lib/i18n/account";
import {
  googleSignInAction,
  passwordSignInAction,
  sendMagicLinkAction,
  signUpAction,
  type SignInState,
} from "./actions";

const INITIAL: SignInState = {};

/**
 * Google sign-in is off until the site has its own verified domain (Google
 * will not publish the consent screen on a vercel.app address). Set to true
 * after the domain is verified and Google is enabled in Supabase.
 */
const GOOGLE_SIGN_IN_ENABLED = false;

type Mode = "signin" | "signup" | "link";

/**
 * Supabase sign-in: email and password, a new account (confirmed through an
 * emailed link), or a one-time link by email, or Google. `next` must already
 * be a sanitized same-site path (see safeNextPath).
 */
export function SignInForm({ next, error }: { next: string; error?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInState, signInAction, signInPending] = useActionState(passwordSignInAction, INITIAL);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, INITIAL);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLinkAction, INITIAL);
  const t = accountMessages(useLocale()).auth;

  const current = mode === "signin" ? signInState : mode === "signup" ? signUpState : linkState;
  const message = current.error ?? error;

  if (signUpState.sentTo && mode === "signup") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md bg-success-soft px-4 py-4">
        <p className="text-xl font-bold">{t.confirmTitle}</p>
        <p>
          {t.sentBefore}{" "}
          <bdi dir="ltr" className="font-medium">
            {signUpState.sentTo}
          </bdi>
          {t.confirmAfter}
        </p>
        <p className="text-muted">{t.notArrived}</p>
      </div>
    );
  }

  if (linkState.sentTo && mode === "link") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md bg-success-soft px-4 py-4">
        <p className="text-xl font-bold">{t.sentTitle}</p>
        <p>
          {t.sentBefore}{" "}
          <bdi dir="ltr" className="font-medium">
            {linkState.sentTo}
          </bdi>
          {t.sentAfter}
        </p>
        <p className="text-muted">{t.notArrived}</p>
      </div>
    );
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        "min-h-touch flex-1 rounded-md px-3 py-2 font-bold",
        mode === value ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      {mode !== "link" ? (
        <div role="tablist" className="flex gap-2">
          {tab("signin", t.tabSignIn)}
          {tab("signup", t.tabSignUp)}
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 font-medium">
          {message}
        </p>
      ) : null}

      {GOOGLE_SIGN_IN_ENABLED ? (
        <>
          <form action={googleSignInAction}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" size="lg" variant="outline" fullWidth>
              {t.google}
            </Button>
          </form>

          <p className="text-center text-muted" aria-hidden="true">
            {t.or}
          </p>
        </>
      ) : null}

      {mode === "signin" ? (
        <form action={signInAction} className="flex flex-col gap-5">
          <input type="hidden" name="next" value={next} />
          <Field label={t.email} htmlFor="sign-in-email" required>
            <Input id="sign-in-email" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email" required maxLength={254} />
          </Field>
          <Field label={t.password} htmlFor="sign-in-password" required>
            <Input id="sign-in-password" name="password" type="password" dir="ltr" autoComplete="current-password" required maxLength={72} />
          </Field>
          <Button type="submit" size="lg" loading={signInPending}>
            {t.signInButton}
          </Button>
          <button type="button" onClick={() => setMode("link")} className="text-center font-medium text-primary underline">
            {t.useLink}
          </button>
        </form>
      ) : null}

      {mode === "signup" ? (
        <form action={signUpFormAction} className="flex flex-col gap-5">
          <input type="hidden" name="next" value={next} />
          <p className="text-muted">{t.signUpIntro}</p>
          <Field label={t.email} htmlFor="sign-up-email" required>
            <Input id="sign-up-email" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email" required maxLength={254} />
          </Field>
          <Field label={t.newPassword} htmlFor="sign-up-password" hint={t.passwordHint} required>
            <Input
              id="sign-up-password"
              name="password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
            />
          </Field>
          <Button type="submit" size="lg" loading={signUpPending}>
            {t.signUpButton}
          </Button>
        </form>
      ) : null}

      {mode === "link" ? (
        <form action={linkAction} className="flex flex-col gap-5">
          <input type="hidden" name="next" value={next} />
          <Field label={t.email} htmlFor="link-email" hint={t.emailHint} required>
            <Input id="link-email" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email" required maxLength={254} />
          </Field>
          <Button type="submit" size="lg" loading={linkPending}>
            {t.sendLink}
          </Button>
          <button type="button" onClick={() => setMode("signin")} className="text-center font-medium text-primary underline">
            {t.usePassword}
          </button>
        </form>
      ) : null}
    </div>
  );
}
