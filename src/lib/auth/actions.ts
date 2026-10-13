"use server";

/** Server Actions for the local development login and for signing out. */
import { redirect } from "next/navigation";
import { z } from "zod";
import { authMode, isLocalLoginAllowed, safeNextPath, signInLocal, signOut } from "./index";

export interface LoginState {
  error?: string;
}

const LoginSchema = z.object({
  name: z.string().trim().min(1, "איך קוראים לך?").max(100),
  email: z.union([z.literal(""), z.string().trim().email("כתובת האימייל לא נראית תקינה")]),
});

/** For useActionState: (prevState, formData) with fields name, email, next. Redirects on success. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (authMode() !== "local") return { error: "ההתחברות לסביבת הפיתוח אינה זמינה כאן." };
  if (!isLocalLoginAllowed()) return { error: "ההתחברות לסביבת הפיתוח כבויה באתר הפעיל." };

  const parsed = LoginSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "הפרטים אינם תקינים" };

  await signInLocal(parsed.data.name, parsed.data.email || undefined);
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/"));
}

/** Use directly as a form action: <form action={logoutAction}>. */
export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/");
}
