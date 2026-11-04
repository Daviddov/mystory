import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LocalLoginForm } from "@/components/auth/LocalLoginForm";
import { SupabaseLoginForm } from "@/components/auth/SupabaseLoginForm";
import { MockNotice } from "@/components/MockNotice";
import { Card, EmptyState } from "@/components/ui";
import { authMode, getCurrentUser, isLocalLoginAllowed, safeNextPath } from "@/lib/auth";
import { accountMessages } from "@/lib/i18n/account";
import { getLocale } from "@/lib/i18n/server";
import { localizeTitle } from "@/lib/i18n/metadata";

const HEBREW_METADATA: Metadata = { title: "כניסה" };

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Sign in");
}

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined, "/");
  if (await getCurrentUser()) redirect(next);

  const mode = authMode();
  const t = accountMessages(await getLocale()).auth;
  return (
    <main className="container-page flex justify-center py-12">
      <Card padding="lg" className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-3xl font-extrabold">{t.signIn}</h1>
        {mode === "supabase" ? (
          <SupabaseLoginForm next={next} />
        ) : isLocalLoginAllowed() ? (
          <>
            <MockNotice kind="login" />
            <LocalLoginForm next={next} />
          </>
        ) : (
          <EmptyState
            icon="🔐"
            title={t.unavailableTitle}
            description={t.unavailableDescription}
          />
        )}
      </Card>
    </main>
  );
}
