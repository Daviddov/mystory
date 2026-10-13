import { Download } from "lucide-react";
import type { Metadata } from "next";
import { ImportStudio } from "@/components/import/ImportStudio";
import { ButtonLink, Card, CardDescription, CardTitle, buttonClasses } from "@/components/ui";
import { requireUserPage } from "@/lib/auth";
import { isOcrAvailable } from "@/lib/importers/ocr";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "ייבוא ספר" };
export const dynamic = "force-dynamic";

const SOURCES = [
  {
    emoji: "🖼️",
    title: "תמונות או תיקייה",
    text: "כל תמונה הופכת לעמוד, לפי סדר שמות הקבצים (1, 2, 10).",
  },
  {
    emoji: "📄",
    title: "קובץ PDF",
    text: "כל עמוד הופך לתמונה, והטקסט שבו נקרא אוטומטית. הקובץ עצמו לא נשלח לשרת.",
  },
  {
    emoji: "📦",
    title: "קובץ zip של ספר",
    text: "ספר שיוצא מהאתר הזה, עם הטקסט, התמונות וההקראה.",
  },
];

export default async function StudioImportPage() {
  const user = await requireUserPage(routes.studioImport());
  const repo = await getRepo();
  const { books } = await repo.listBooks({ ownerId: user.id, status: "any", sort: "updated", limit: 50 });

  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold sm:text-4xl">ייבוא ספר</h1>
        <p className="max-w-3xl text-lg text-muted">
          כל ייבוא יוצר טיוטה פרטית שלכם ופותח אותה בעורך. שם אפשר לתקן טקסט, להוסיף הקראה ולשלוח לפרסום.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {SOURCES.map((source) => (
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
        <CardTitle id="export-title">ייצוא ספר לקובץ zip</CardTitle>
        <CardDescription>
          הקובץ מכיל את הטקסט, התמונות וההקראה, ואפשר לייבא אותו בחזרה כאן או באתר אחר שמריץ את אותה מערכת.
        </CardDescription>
        {books.length === 0 ? (
          <p className="text-muted">עדיין אין לכם ספרים לייצא.</p>
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
                  aria-label={`הורדת הספר ${book.title} כקובץ zip`}
                >
                  <Download aria-hidden="true" className="size-4" />
                  הורדה
                </a>
              </li>
            ))}
          </ul>
        )}
        <div>
          <ButtonLink href={routes.studio()} variant="ghost">
            חזרה לסטודיו
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
