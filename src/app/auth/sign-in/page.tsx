import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { authMode, getCurrentUser, safeNextPath } from "@/lib/auth";
import { accountMessages } from "@/lib/i18n/account";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { SignInForm } from "../SignInForm";

export const metadata: Metadata = { title: "כניסה" };
export const dynamic = "force-dynamic";

/** Sign-in page of Supabase mode. In local mode it hands over to /login. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined, "/");
  if (authMode() !== "supabase") redirect(routes.login(next === "/" ? undefined : next));
  if (await getCurrentUser()) redirect(next);

  const locale = await getLocale();
  const t = accountMessages(locale).auth;
  const error = typeof params.error === "string" && Object.hasOwn(t.errors, params.error) ? t.errors[params.error] : undefined;
  return (
    <main className="container-page flex justify-center py-12">
      <Card padding="lg" className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-3xl font-extrabold">{t.signIn}</h1>
        <p className="text-lg text-muted">{t.signInIntro}</p>
        <SignInForm next={next} error={error} />
      </Card>
    </main>
  );
}
