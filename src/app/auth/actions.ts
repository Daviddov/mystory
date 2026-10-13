"use server";

/** Server Actions for Supabase sign-in: email magic link and Google. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authMode, safeNextPath } from "@/lib/auth";

export interface SignInState {
  error?: string;
  /** Set after the magic link was sent: the address it went to. */
  sentTo?: string;
}

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

const UNAVAILABLE = "ההתחברות עם חשבון אינה זמינה באתר הזה.";

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
  if (authMode() !== "supabase") return { error: UNAVAILABLE };

  const parsed = EmailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) return { error: "כתובת האימייל לא נראית תקינה." };
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next), shouldCreateUser: true },
  });
  if (error) {
    console.warn("[auth] magic link failed:", error.message);
    if (error.status === 429) return { error: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות." };
    return { error: "לא הצלחנו לשלוח את הקישור. בדקו את הכתובת ונסו שוב." };
  }
  return { sentTo: parsed.data };
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
