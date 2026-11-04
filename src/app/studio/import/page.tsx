import { Download } from "lucide-react";
import type { Metadata } from "next";
import { ImportStudio } from "@/components/import/ImportStudio";
import { ButtonLink, Card, CardDescription, CardTitle, buttonClasses } from "@/components/ui";
import { requireUserPage } from "@/lib/auth";
import { STUDIO_IMPORT_PAGE } from "@/lib/i18n/studio-import";
import { getLocale } from "@/lib/i18n/server";
import { isOcrAvailable } from "@/lib/importers/ocr";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "ייבוא ספר" };
export const dynamic = "force-dynamic";

export default async function StudioImportPage() {
  const user = await requireUserPage(routes.studioImport());
  const repo = await getRepo();
  const { books } = await repo.listBooks({ ownerId: user.id, status: "any", sort: "updated", limit: 50 });
  const t = STUDIO_IMPORT_PAGE[await getLocale()];

  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{t.heading}</h1>
        <p className="max-w-3xl text-lg text-muted">
          {t.intro}
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {t.sources.map((source) => (
          <Card as="li" key={source.title} tone="soft" className="flex flex-col gap-1">
            <span aria-hidden="true" className="text-3xl">
              {source.emoji}
            </span>
            <CardTitle>{source.title}</CardTitle>
            <CardDescription>{source.text}</CardDescription>
          </Card>
        ))}
      </ul>

      <ImportStudio ocrEnabled={isOcrAvailable()} />

      <Card as="section" className="flex flex-col gap-4" aria-labelledby="export-title">
        <CardTitle id="export-title">{t.exportTitle}</CardTitle>
        <CardDescription>
          {t.exportText}
        </CardDescription>
        {books.length === 0 ? (
          <p className="text-muted">{t.noBooks}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {books.map((book) => (
              <li key={book.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-lg font-semibold" dir="auto">
                  {book.title}
                </span>
                {/* A plain link: the route answers with a file download, not a page. */}
                <a
                  href={routes.exportBook(book.id)}
                  download
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                  aria-label={t.downloadLabel(book.title)}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {t.download}
                </a>
              </li>
            ))}
          </ul>
        )}
        <div>
          <ButtonLink href={routes.studio()} variant="ghost">
            {t.back}
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
