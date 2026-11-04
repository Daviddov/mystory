import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { accountMessages } from "@/lib/i18n/account";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { localizeTitle } from "@/lib/i18n/metadata";

const HEBREW_METADATA: Metadata = { title: "יציאה" };

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Sign out");
}

export const dynamic = "force-dynamic";

export default async function LogoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.home());
  const t = accountMessages(await getLocale()).auth;

  return (
    <main className="container-page flex justify-center py-12">
      <Card padding="lg" className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-3xl font-extrabold">{t.signOut}</h1>
        <p className="text-lg text-muted">{t.signedInAs(user.name)}</p>
        <form action={logoutAction} className="flex flex-wrap gap-3">
          <Button type="submit" size="lg">
            {t.signOut}
          </Button>
          <ButtonLink href={routes.home()} variant="outline" size="lg">
            {t.cancel}
          </ButtonLink>
        </form>
      </Card>
    </main>
  );
}
