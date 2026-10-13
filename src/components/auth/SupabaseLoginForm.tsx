/**
 * /login renders this component instead of the development form whenever the
 * Supabase env vars are set. `next` is an already sanitized same-site path to
 * return to after signing in. (The proxy normally redirects /login to
 * /auth/sign-in in Supabase mode; this keeps /login working without it.)
 */
import { SignInForm } from "@/app/auth/SignInForm";

export function SupabaseLoginForm({ next }: { next: string }) {
  return <SignInForm next={next} />;
}
