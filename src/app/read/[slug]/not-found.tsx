import { ButtonLink, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { routes } from "@/lib/routes";

/** Shown for a missing book and for a private book the visitor may not read (the two look the same on purpose). */
export default async function ReadNotFound() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const t = READER_MESSAGES[locale].readNotFound;
  return (
    <main className="container-page py-16">
      <EmptyState
        icon="🔍"
        title={t.title}
        description={
          user ? t.signedIn : t.signedOut
        }
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={routes.books()}>{t.allBooks}</ButtonLink>
            {user ? null : (
              <ButtonLink href={routes.login()} variant="outline">
                {t.signIn}
              </ButtonLink>
            )}
          </div>
        }
      />
    </main>
  );
}
