/**
 * GET /auth/callback: the page Supabase sends the visitor back to.
 *
 *   ?code=...                    PKCE code from a magic link or from Google
 *   ?token_hash=...&type=email   one-time token, when the email template links
 *                                here directly (works on any device)
 *
 * On success the session cookies are set and the visitor continues to `next`.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { authMode, safeNextPath } from "@/lib/auth";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  code: z.string().min(1).max(2000).optional(),
  token_hash: z.string().min(1).max(2000).optional(),
  type: z.enum(["email", "magiclink", "signup", "invite", "recovery", "email_change"]).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const next = safeNextPath(params.get("next"), "/");
  if (authMode() !== "supabase") redirect(routes.login());

  const signIn = (q: string) => `/auth/sign-in?${q}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;
  const failed = signIn("error=link");
  const query = QuerySchema.safeParse({
    code: params.get("code") ?? undefined,
    token_hash: params.get("token_hash") ?? undefined,
    type: params.get("type") ?? undefined,
  });
  if (!query.success) redirect(failed);

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { code, token_hash: tokenHash, type } = query.data;

  if (code) {
    // Supabase hands out a code only after it has verified the emailed token, so
    // the address is confirmed even when the exchange fails here (usually the link
    // was opened in another browser, which lacks the PKCE verifier cookie).
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[auth] code exchange failed after a verified link:", error.message);
      redirect(signIn("notice=confirmed"));
    }
    redirect(next);
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? "email" });
    if (error) {
      console.warn("[auth] sign-in callback failed:", error.message);
      redirect(failed);
    }
    redirect(next);
  }

  // No code: Supabase refused the link before redirecting. Its reason travels in
  // the URL fragment, which never reaches the server; by far the usual one is a
  // link opened a second time (otp_expired) after it already confirmed the address.
  console.warn("[auth] sign-in callback without a code:", params.get("error_code") ?? "no details");
  redirect(signIn("notice=used"));
}
