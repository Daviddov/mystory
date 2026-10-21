import type { Metadata } from "next";
import Link from "next/link";
import { BookRowActions } from "@/components/admin/BookRowActions";
import { StatusChip } from "@/components/admin/StatusChip";
import { Button, ButtonLink, EmptyState, Input, Label, Select } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import type { BookSort } from "@/lib/repo/types";
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
/** Author filter value for books without an author. */
const NO_AUTHOR = "-";

const SORTS = [
  { value: "updated", label: "עודכן לאחרונה" },
  { value: "author", label: "מחבר, א עד ת" },
  { value: "title", label: "שם הספר, א עד ת" },
  { value: "new", label: "פורסם לאחרונה" },
  { value: "popular", label: "הכי נצפים" },
] as const satisfies readonly { value: BookSort; label: string }[];
type AdminSort = (typeof SORTS)[number]["value"];

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
  const authorParam = first(params.author).slice(0, 200);
  const sortParam = first(params.sort);
  const sort: AdminSort = SORTS.find((option) => option.value === sortParam)?.value ?? "updated";
  const audio = first(params.audio) === "1";
  const nikud = first(params.nikud) === "1";
  const anim = first(params.anim) === "1";
  const pageParam = Number.parseInt(first(params.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const repo = await getRepo();
  const [{ books, total }, owners, settings, everyBook] = await Promise.all([
    repo.listBooks({
      status: status ?? "any",
      author: authorParam === NO_AUTHOR ? "" : authorParam || undefined,
      query: query || undefined,
      hasAudio: audio || undefined,
      hasNikud: nikud || undefined,
      hasAnimation: anim || undefined,
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    ownerNames(repo),
    repo.getSettings(),
    repo.listBooks({ status: "any" }),
  ]);
  const authors = [...new Set(everyBook.books.map((book) => book.author).filter((name) => name.trim() !== ""))].sort(
    (a, b) => a.localeCompare(b, "he"),
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = query !== "" || status !== undefined || authorParam !== "" || audio || nikud || anim;
  const linkParams = {
    q: query,
    status,
    author: authorParam,
    sort: sort === "updated" ? undefined : sort,
    audio: audio ? "1" : undefined,
    nikud: nikud ? "1" : undefined,
    anim: anim ? "1" : undefined,
  };

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="books-author">מחבר</Label>
          <Select id="books-author" name="author" defaultValue={authorParam} className="w-auto max-w-64">
            <option value="">כל המחברים</option>
            <option value={NO_AUTHOR}>ללא מחבר</option>
            {authors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="books-sort">מיון</Label>
          <Select id="books-sort" name="sort" defaultValue={sort} className="w-auto">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2">
          <legend className="sr-only">סוג התוכן</legend>
          {(
            [
              ["audio", "🔊 השמעה", audio],
              ["nikud", "אָ ניקוד", nikud],
              ["anim", "🎬 הנפשות", anim],
            ] as const
          ).map(([name, label, checked]) => (
            <label key={name} className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name={name} value="1" defaultChecked={checked} className="size-5 accent-primary" />
              {label}
            </label>
          ))}
        </fieldset>
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
          description={filtered ? "נסו מילת חיפוש, סטטוס או סינון אחר." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[60rem] border-collapse text-start">
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th scope="col" className="p-3 text-start font-semibold">
                  ספר
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  <Link
                    href={adminPaths.books({ ...linkParams, sort: sort === "author" ? undefined : "author" })}
                    className="underline-offset-2 hover:underline"
                    title={sort === "author" ? "חזרה למיון לפי עדכון" : "מיון לפי מחבר"}
                  >
                    מחבר{sort === "author" ? " ▲" : ""}
                  </Link>
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
                    {book.author.trim() ? (
                      <Link
                        href={adminPaths.books({ ...linkParams, author: book.author })}
                        className="hover:underline"
                        title="רק ספרים של המחבר הזה"
                      >
                        {book.author}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
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
            <ButtonLink href={adminPaths.books({ ...linkParams, page: page - 1 })} variant="outline" size="sm">
              הקודם
            </ButtonLink>
          ) : null}
          <span className="text-muted">
            עמוד {Math.min(page, pageCount)} מתוך {pageCount}
          </span>
          {page < pageCount ? (
            <ButtonLink href={adminPaths.books({ ...linkParams, page: page + 1 })} variant="outline" size="sm">
              הבא
            </ButtonLink>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
