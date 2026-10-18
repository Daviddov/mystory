import type { Metadata } from "next";
import { Plus, Sparkles, Upload } from "lucide-react";
import { BookCard } from "@/components/BookCard";
import { BookCardActions } from "@/components/studio/BookCardActions";
import { ButtonLink, EmptyState } from "@/components/ui";
import { hasRole, requireUserPage } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { STATUS_LABELS } from "@/lib/studio/shared";
import type { BookStatus } from "@/lib/types";

export const metadata: Metadata = { title: "הספרים שלי" };
export const dynamic = "force-dynamic";

const STATUS_ORDER: BookStatus[] = ["draft", "pending", "private", "published"];

const SECTION_TITLES: Record<BookStatus, string> = {
  draft: "טיוטות",
  pending: "ממתינים לאישור",
  private: "ספרים פרטיים",
  published: "פורסמו בספרייה",
};

export default async function StudioPage() {
  const user = await requireUserPage(routes.studio());
  const repo = await getRepo();
  const { books } = await repo.listBooks({ ownerId: user.id, status: "any", sort: "updated" });
  const isEditor = hasRole(user, "editor");

  const groups = STATUS_ORDER.map((status) => ({
    status,
    books: books.filter((book) => book.status === status),
  })).filter((group) => group.books.length > 0);

  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-4xl font-extrabold">הספרים שלי</h1>
          <p className="mt-1 text-lg text-muted">כאן יוצרים ספר חדש וממשיכים לעבוד על ספרים קיימים.</p>
        </div>
        <ButtonLink href={routes.studioNew()} size="lg">
          <Plus aria-hidden="true" />
          ספר חדש
        </ButtonLink>
        <ButtonLink href={routes.studioImport()} variant="outline">
          <Upload aria-hidden="true" className="size-5" />
          ייבוא מקובץ
        </ButtonLink>
        <ButtonLink href={routes.create()} variant="outline">
          <Sparkles aria-hidden="true" className="size-5" />
          יצירה עם AI
        </ButtonLink>
      </header>

      {books.length === 0 ? (
        <EmptyState
          icon="✏️"
          title="עוד אין לכם ספרים"
          description="מעלים תמונות, כותבים או מדביקים את הטקסט, מקליטים הקראה, והספר מוכן לקריאה."
          action={
            <ButtonLink href={routes.studioNew()} size="lg">
              יצירת הספר הראשון
            </ButtonLink>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.status} aria-labelledby={`studio-${group.status}`} className="flex flex-col gap-4">
            <h2 id={`studio-${group.status}`} className="text-2xl font-bold">
              {SECTION_TITLES[group.status]}{" "}
              <span className="text-lg font-normal text-muted">({group.books.length})</span>
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {group.books.map((book) => (
                <li key={book.id}>
                  <BookCard
                    book={book}
                    href={routes.studioBook(book.id)}
                    badge={STATUS_LABELS[book.status]}
                    footer={
                      <div className="flex flex-col gap-2">
                        {book.reviewNote ? (
                          <p className="rounded-sm bg-warning-soft px-2 py-1 text-sm">יש הערה מהעורך</p>
                        ) : null}
                        <BookCardActions
                          bookId={book.id}
                          title={book.title}
                          shareToken={book.shareToken}
                          canDelete={book.status !== "published" || isEditor}
                        />
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
