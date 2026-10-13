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

  const failed = `/auth/sign-in?error=link${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;
  const query = QuerySchema.safeParse({
    code: params.get("code") ?? undefined,
    token_hash: params.get("token_hash") ?? undefined,
    type: params.get("type") ?? undefined,
  });
  if (!query.success) redirect(failed);

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { code, token_hash: tokenHash, type } = query.data;

  let errorMessage: string | undefined;
  if (code) {
    errorMessage = (await supabase.auth.exchangeCodeForSession(code)).error?.message;
  } else if (tokenHash) {
    errorMessage = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? "email" })).error?.message;
  } else {
    errorMessage = params.get("error_description") ?? "missing code";
  }

  if (errorMessage) {
    console.warn("[auth] sign-in callback failed:", errorMessage);
    redirect(failed);
  }
  redirect(next);
}
