"use server";

/** Server Actions for the local development login and for signing out. */
import { redirect } from "next/navigation";
import { z } from "zod";
import { accountMessages } from "../i18n/account";
import { getLocale } from "../i18n/server";
import { authMode, isLocalLoginAllowed, safeNextPath, signInLocal, signOut } from "./index";

export interface LoginState {
  error?: string;
}

function loginSchema(t: { nameRequired: string; localBadEmail: string }) {
  return z.object({
    name: z.string().trim().min(1, t.nameRequired).max(100),
    email: z.union([z.literal(""), z.string().trim().email(t.localBadEmail)]),
  });
}

/** For useActionState: (prevState, formData) with fields name, email, next. Redirects on success. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const t = accountMessages(await getLocale()).auth;
  if (authMode() !== "local") return { error: t.localUnavailable };
  if (!isLocalLoginAllowed()) return { error: t.localDisabled };

  const parsed = loginSchema(t).safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.invalid };

  await signInLocal(parsed.data.name, parsed.data.email || undefined);
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/"));
}

/** Use directly as a form action: <form action={logoutAction}>. */
export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/");
}
