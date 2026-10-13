"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { googleSignInAction, sendMagicLinkAction, type SignInState } from "./actions";

const INITIAL: SignInState = {};

/**
 * Supabase sign-in: a one-time link by email, or Google. `next` must already
 * be a sanitized same-site path (see safeNextPath).
 */
export function SignInForm({ next, error }: { next: string; error?: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLinkAction, INITIAL);
  const message = state.error ?? error;

  if (state.sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md bg-success-soft px-4 py-4">
        <p className="text-xl font-bold">שלחנו לכם קישור כניסה</p>
        <p>
          הקישור נשלח אל{" "}
          <bdi dir="ltr" className="font-medium">
            {state.sentTo}
          </bdi>
          . פתחו את האימייל באותו מכשיר ובאותו דפדפן, ולחצו על הקישור כדי להיכנס.
        </p>
        <p className="text-muted">לא הגיע? בדקו בתיקיית הספאם, או רעננו את הדף ונסו שוב.</p>
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
          כניסה עם Google
        </Button>
      </form>

      <p className="text-center text-muted" aria-hidden="true">
        או
      </p>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />
        <Field label="אימייל" htmlFor="sign-in-email" hint="נשלח אליכם קישור כניסה חד-פעמי. בלי סיסמה." required>
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
          שלחו לי קישור כניסה
        </Button>
      </form>
    </div>
  );
}
