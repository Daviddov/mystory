import type { Metadata } from "next";
import Link from "next/link";
import { BookRowActions } from "@/components/admin/BookRowActions";
import { StatusChip } from "@/components/admin/StatusChip";
import { Button, ButtonLink, EmptyState, Input, Label, Select } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { ageGroupLabel } from "@/lib/taxonomy";
import { BOOK_STATUSES, BookStatusSchema, SYSTEM_OWNER_ID } from "@/lib/types";
import { requireAdminPage } from "../_lib/guard";
import { formatDate, ORIGIN_LABELS, STATUS_LABELS } from "../_lib/labels";
import { adminPaths } from "../_lib/paths";
import { missingPublishCredits, ownerNames } from "../_lib/service";

export const metadata: Metadata = { title: "כל הספרים" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdminPage(adminPaths.books());
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 200);
  const statusParam = BookStatusSchema.safeParse(first(params.status));
  const status = statusParam.success ? statusParam.data : undefined;
  const pageParam = Number.parseInt(first(params.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const repo = await getRepo();
  const [{ books, total }, owners, settings] = await Promise.all([
    repo.listBooks({
      status: status ?? "any",
      query: query || undefined,
      sort: "updated",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    ownerNames(repo),
    repo.getSettings(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = query !== "" || status !== undefined;

  return (
    <section aria-labelledby="books-heading" className="flex flex-col gap-4">
      <h2 id="books-heading" className="text-2xl font-bold">
        כל הספרים ({total})
      </h2>

      <form method="get" action={adminPaths.books()} role="search" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="books-q">חיפוש</Label>
          <Input id="books-q" name="q" type="search" defaultValue={query} placeholder="שם ספר, מחבר, תגית…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="books-status">סטטוס</Label>
          <Select id="books-status" name="status" defaultValue={status ?? ""} className="w-auto">
            <option value="">כל הסטטוסים</option>
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          סינון
        </Button>
        {filtered ? (
          <ButtonLink href={adminPaths.books()} variant="ghost">
            ניקוי
          </ButtonLink>
        ) : null}
      </form>

      {books.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={filtered ? "לא נמצאו ספרים" : "אין ספרים באתר"}
          description={filtered ? "נסו מילת חיפוש אחרת או סטטוס אחר." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[52rem] border-collapse text-start">
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th scope="col" className="p-3 text-start font-semibold">
                  ספר
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  סטטוס
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  יוצר
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  צפיות
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  עודכן
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => {
                const cover = mediaUrl(book.coverImage, book.updatedAt);
                return (
                <tr key={book.id} className="border-t border-border align-top">
                  <th scope="row" className="p-3 text-start font-normal">
                    <div className="flex items-start gap-3">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          loading="lazy"
                          className="h-20 w-16 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-xl">
                          📖
                        </div>
                      )}
                      <div className="min-w-0">
                    <Link href={adminPaths.book(book.id)} className="font-semibold underline">
                      {book.title}
                    </Link>
                    <div className="text-sm text-muted">
                      {ageGroupLabel(book.ageGroup)} · {ORIGIN_LABELS[book.origin]}
                      {settings.bookOfTheWeekId === book.id ? " · ספר השבוע" : ""}
                    </div>
                    <div className="mt-1 flex gap-3 text-sm">
                      <Link href={routes.read(book.slug)} className="underline">
                        קריאה
                      </Link>
                      <Link href={routes.studioBook(book.id)} className="underline">
                        עריכה בסטודיו
                      </Link>
                    </div>
                      </div>
                    </div>
                  </th>
                  <td className="p-3">
                    <StatusChip status={book.status} />
                  </td>
                  <td className="p-3">
                    {book.ownerId === SYSTEM_OWNER_ID ? "ספריית האתר" : (owners.get(book.ownerId) ?? "לא ידוע")}
                  </td>
                  <td className="p-3 tabular-nums">{book.viewCount}</td>
                  <td className="whitespace-nowrap p-3">{formatDate(book.updatedAt)}</td>
                  <td className="p-3">
                    <BookRowActions
                      bookId={book.id}
                      title={book.title}
                      status={book.status}
                      isBookOfTheWeek={settings.bookOfTheWeekId === book.id}
                      missingCredits={missingPublishCredits(book)}
                      canWaiveCredits={viewer.role === "admin"}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="עמודי התוצאות" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <ButtonLink href={adminPaths.books({ q: query, status, page: page - 1 })} variant="outline" size="sm">
              הקודם
            </ButtonLink>
          ) : null}
          <span className="text-muted">
            עמוד {Math.min(page, pageCount)} מתוך {pageCount}
          </span>
          {page < pageCount ? (
            <ButtonLink href={adminPaths.books({ q: query, status, page: page + 1 })} variant="outline" size="sm">
              הבא
            </ButtonLink>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
