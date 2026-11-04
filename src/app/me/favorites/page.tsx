import type { Metadata } from "next";
import Link from "next/link";
import { PersonalLibrary } from "@/components/personal/PersonalLibrary";
import { PersonalSync } from "@/components/personal/PersonalSync";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { accountMessages } from "@/lib/i18n/account";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "המועדפים שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  const t = accountMessages(await getLocale()).me;
  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <PersonalSync userId={user?.id ?? null} quiet />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">{t.favoritesTitle}</h1>
        <ButtonLink href={routes.me()} variant="ghost" size="sm">
          {t.backToShelf}
        </ButtonLink>
        {user ? null : (
          <p className="text-muted">
            {t.favoritesLocalBefore}{" "}
            <Link href={routes.login(routes.favorites())} className="font-semibold underline">
              {t.favoritesLocalLink}
            </Link>{" "}
            {t.favoritesLocalAfter}
          </p>
        )}
      </header>
      <PersonalLibrary mode="favorites" signedIn={!!user} />
    </main>
  );
}
