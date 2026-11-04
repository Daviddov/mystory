import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { NewBookForm } from "@/components/studio/NewBookForm";
import { ButtonLink, Card } from "@/components/ui";
import { requireUserPage } from "@/lib/auth";
import { STUDIO_NEW_BOOK } from "@/lib/i18n/studio";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { localizeTitle } from "@/lib/i18n/metadata";

const HEBREW_METADATA: Metadata = { title: "ספר חדש" };

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "New book");
}

export const dynamic = "force-dynamic";

export default async function NewBookPage() {
  await requireUserPage(routes.studioNew());
  const t = STUDIO_NEW_BOOK[await getLocale()];
  return (
    <main className="container-page flex flex-col items-center gap-6 py-10">
      <Card padding="lg" className="flex w-full max-w-xl flex-col gap-6">
        <div>
          <ButtonLink variant="ghost" size="sm" href={routes.studio()}>
            <ArrowRight aria-hidden="true" className="size-4 ltr:-scale-x-100" />
            {t.myBooks}
          </ButtonLink>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">{t.heading}</h1>
          <p className="mt-2 leading-relaxed text-muted">{t.intro}</p>
        </div>
        <NewBookForm />
      </Card>
    </main>
  );
}
