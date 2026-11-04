import type { Metadata } from "next";
import { ButtonLink, EmptyState } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.notFound.title, robots: { index: false } };
}

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="container-page py-16">
      <h1 className="sr-only">{t.notFound.title}</h1>
      <EmptyState
        icon="🧭"
        title={t.notFound.heading}
        description={t.notFound.description}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={routes.home()}>{t.notFound.home}</ButtonLink>
            <ButtonLink href={routes.books()} variant="outline">
              {t.notFound.books}
            </ButtonLink>
            <ButtonLink href={routes.search()} variant="outline">
              {t.notFound.search}
            </ButtonLink>
          </div>
        }
      />
    </main>
  );
}
