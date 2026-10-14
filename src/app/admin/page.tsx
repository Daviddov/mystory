import type { Metadata } from "next";
import Link from "next/link";
import { MockNotice } from "@/components/MockNotice";
import { ButtonLink, Card, CardDescription, CardTitle, EmptyState } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { BOOK_ORIGINS, BOOK_STATUSES, JOB_STATUSES } from "@/lib/types";
import { requireAdminPage } from "./_lib/guard";
import { JOB_STATUS_LABELS, ORIGIN_LABELS, STATUS_LABELS } from "./_lib/labels";
import { adminPaths } from "./_lib/paths";
import { getDashboardStats } from "./_lib/service";

export const metadata: Metadata = { title: "סקירה" };
export const dynamic = "force-dynamic";

const NUMBER = new Intl.NumberFormat("he-IL");
const USD = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <>
      <span className="text-4xl font-extrabold leading-none tabular-nums">{value}</span>
      <span className="text-muted">{label}</span>
    </>
  );
  const classes = "flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-card";
  return href ? (
    <Link href={href} className={`${classes} hover:bg-surface-2`}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdminPage(adminPaths.home());
  const stats = await getDashboardStats(await getRepo());
  const generations = stats.generations;
  const topViews = stats.mostViewed[0]?.viewCount ?? 0;
  const unpublished = stats.byStatus.draft + stats.byStatus.private;

  return (
    <div className="flex flex-col gap-8">
      {stats.byStatus.pending > 0 ? (
        <Card tone="soft" className="flex flex-wrap items-center gap-4">
          <p className="flex-1 text-lg font-semibold">
            {stats.byStatus.pending === 1
              ? "ספר אחד ממתין לאישור."
              : `${NUMBER.format(stats.byStatus.pending)} ספרים ממתינים לאישור.`}
          </p>
          <ButtonLink href={adminPaths.queue()} variant="secondary">
            לתור האישורים
          </ButtonLink>
        </Card>
      ) : null}

      {unpublished > 0 ? (
        <Card tone="soft" className="flex flex-wrap items-center gap-4">
          <p className="flex-1 text-lg font-semibold">
            {unpublished === 1
              ? "ספר אחד עוד לא פורסם."
              : `${NUMBER.format(unpublished)} ספרים עוד לא פורסמו.`}{" "}
            <span className="font-normal text-muted">במסלול הפרסום רואים מה חסר לכל אחד ומטפלים בכמה ספרים יחד.</span>
          </p>
          <ButtonLink href={adminPaths.pipeline()} variant="secondary">
            למסלול הפרסום
          </ButtonLink>
        </Card>
      ) : null}

      <section aria-labelledby="status-heading" className="flex flex-col gap-3">
        <h2 id="status-heading" className="text-2xl font-bold">
          ספרים לפי סטטוס
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="כל הספרים" value={NUMBER.format(stats.totalBooks)} href={adminPaths.books()} />
          {BOOK_STATUSES.map((status) => (
            <Stat
              key={status}
              label={STATUS_LABELS[status]}
              value={NUMBER.format(stats.byStatus[status])}
              href={status === "pending" ? adminPaths.queue() : adminPaths.books({ status })}
            />
          ))}
        </div>
        <p className="text-muted">
          {BOOK_ORIGINS.map((origin) => `${ORIGIN_LABELS[origin]}: ${NUMBER.format(stats.byOrigin[origin])}`).join(
            " · ",
          )}
          {` · אוספים: ${NUMBER.format(stats.collections)}`}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="views-heading" className="flex flex-col gap-4">
          <CardTitle id="views-heading">הספרים הנצפים ביותר</CardTitle>
          {stats.mostViewed.length === 0 ? (
            <CardDescription>עדיין אין צפיות בספרים מפורסמים.</CardDescription>
          ) : (
            <ol className="flex flex-col gap-3">
              {stats.mostViewed.map((book, index) => (
                <li key={book.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-muted">{index + 1}.</span>
                    <Link href={adminPaths.book(book.id)} className="min-w-0 flex-1 truncate font-semibold underline">
                      {book.title}
                    </Link>
                    <span className="shrink-0 tabular-nums">{NUMBER.format(book.viewCount)} צפיות</span>
                  </div>
                  <div className="ms-7 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-secondary"
                      style={{
                        width: `${Math.max(2, (book.viewCount / topViews) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card as="section" aria-labelledby="ai-heading" className="flex flex-col gap-4">
          <CardTitle id="ai-heading">יצירות AI בשבעת הימים האחרונים</CardTitle>
          {generations.total === 0 ? (
            <CardDescription>לא נוצרו ספרים ב-AI השבוע.</CardDescription>
          ) : (
            <>
              <p>
                <span className="text-4xl font-extrabold tabular-nums">{NUMBER.format(generations.total)}</span>{" "}
                <span className="text-muted">
                  בקשות יצירה (אשף: {NUMBER.format(generations.wizard)}, סיפור יומי: {NUMBER.format(generations.daily)})
                </span>
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {JOB_STATUSES.map((status) => (
                  <div key={status}>
                    <dt className="text-sm text-muted">{JOB_STATUS_LABELS[status]}</dt>
                    <dd className="text-xl font-bold tabular-nums">{NUMBER.format(generations.byStatus[status])}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted">עלות נמדדת: {USD.format(generations.costUsd)}</p>
              {generations.usedMock > 0 ? (
                <MockNotice>
                  {NUMBER.format(generations.usedMock)} מהיצירות השבוע השתמשו בשירות הדגמה (טקסט, קול או איור לדוגמה),
                  ולכן אינן תוצאה אמיתית של AI.
                </MockNotice>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <Card as="section" aria-labelledby="weekly-heading" className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <CardTitle id="weekly-heading">ספר השבוע</CardTitle>
          {stats.bookOfTheWeek ? (
            <p className="text-lg">
              <Link href={routes.book(stats.bookOfTheWeek.slug)} className="underline">
                {stats.bookOfTheWeek.title}
              </Link>
            </p>
          ) : (
            <CardDescription>לא נבחר ספר השבוע.</CardDescription>
          )}
        </div>
        <ButtonLink href={adminPaths.collections()} variant="outline">
          שינוי
        </ButtonLink>
      </Card>

      {stats.totalBooks === 0 ? (
        <EmptyState title="אין ספרים באתר" description="הריצו npm run seed כדי לטעון את ספרי הדוגמה." />
      ) : null}
    </div>
  );
}
