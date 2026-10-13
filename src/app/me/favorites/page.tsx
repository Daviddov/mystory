import type { Metadata } from "next";
import Link from "next/link";
import { PersonalLibrary } from "@/components/personal/PersonalLibrary";
import { PersonalSync } from "@/components/personal/PersonalSync";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "המועדפים שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <PersonalSync userId={user?.id ?? null} quiet />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">המועדפים שלי</h1>
        <ButtonLink href={routes.me()} variant="ghost" size="sm">
          חזרה למדף שלי
        </ButtonLink>
        {user ? null : (
          <p className="text-muted">
            המועדפים שמורים במכשיר הזה. אחרי{" "}
            <Link href={routes.login(routes.favorites())} className="font-semibold underline">
              כניסה לחשבון
            </Link>{" "}
            הם יישמרו גם בו.
          </p>
        )}
      </header>
      <PersonalLibrary mode="favorites" signedIn={!!user} />
    </main>
  );
}
