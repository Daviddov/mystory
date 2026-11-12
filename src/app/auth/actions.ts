"use server";

/** Server Actions for Supabase sign-in: email magic link and Google. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authMode, safeNextPath } from "@/lib/auth";
import { accountMessages } from "@/lib/i18n/account";
import { getLocale } from "@/lib/i18n/server";

export interface SignInState {
  error?: string;
  /** Set after the magic link was sent: the address it went to. */
  sentTo?: string;
}

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Absolute origin for the links Supabase sends the visitor back to.
 * NEXT_PUBLIC_SITE_URL wins; otherwise it is derived from the request, and
 * Supabase still refuses any URL missing from the project's redirect allow list.
 */
async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function callbackUrl(next: string): Promise<string> {
  const url = new URL("/auth/callback", await requestOrigin());
  if (next !== "/") url.searchParams.set("next", next);
  return url.toString();
}

/** For useActionState: fields `email`, `next`. Sends a one-time sign-in link. */
export async function sendMagicLinkAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const t = accountMessages(await getLocale()).auth;
  if (authMode() !== "supabase") return { error: t.supabaseUnavailable };

  const parsed = EmailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) return { error: t.badEmail };
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next), shouldCreateUser: true },
  });
  if (error) {
    console.warn("[auth] magic link failed:", error.message);
    if (error.status === 429) return { error: t.tooManyRequests };
    return { error: t.sendFailed };
  }
  return { sentTo: parsed.data };
}

const PasswordSchema = z.string().min(8).max(72);

/**
 * For useActionState: fields `email`, `password`, `next`. Opens an account; the
 * address must be confirmed through the emailed link before the first sign-in.
 * The answer is the same whether or not the address already has an account.
 */
export async function signUpAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const t = accountMessages(await getLocale()).auth;
  if (authMode() !== "supabase") return { error: t.supabaseUnavailable };

  const email = EmailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { error: t.badEmail };
  const password = PasswordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!password.success) return { error: t.badPassword };
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: await callbackUrl(next) },
  });
  if (error) {
    console.warn("[auth] sign-up failed:", error.message);
    if (error.status === 429) return { error: t.tooManyRequests };
    if (error.code === "weak_password") return { error: t.badPassword };
    return { error: t.signUpFailed };
  }
  return { sentTo: email.data };
}

/** For useActionState: fields `email`, `password`, `next`. Signs in with email and password. */
export async function passwordSignInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const t = accountMessages(await getLocale()).auth;
  if (authMode() !== "supabase") return { error: t.supabaseUnavailable };

  const email = EmailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { error: t.badEmail };
  const password = String(formData.get("password") ?? "");
  if (password === "" || password.length > 72) return { error: t.wrongCredentials };
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  if (error) {
    console.warn("[auth] password sign-in failed:", error.message);
    if (error.status === 429) return { error: t.tooManyRequests };
    if (error.code === "email_not_confirmed") return { error: t.notConfirmed };
    return { error: t.wrongCredentials };
  }
  redirect(next);
}

/** Form action: field `next`. Redirects the browser to Google. */
export async function googleSignInAction(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");
  const failed = `/auth/sign-in?error=google${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;
  if (authMode() !== "supabase") redirect(failed);

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });
  if (error || !data.url) {
    console.warn("[auth] Google sign-in failed:", error?.message);
    redirect(failed);
  }
  redirect(data.url);
}
