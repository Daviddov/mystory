import type { Metadata } from "next";
import Link from "next/link";
import { RecordingReviewActions } from "@/components/admin/RecordingReviewActions";
import { ReviewActions } from "@/components/admin/ReviewActions";
import { ButtonLink, Card, CardTitle, Chip, EmptyState } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { ageGroupLabel, readingTimeLabel } from "@/lib/taxonomy";
import { SYSTEM_OWNER_ID, type BookWithPages, type Recording } from "@/lib/types";
import { requireAdminPage } from "../_lib/guard";
import { formatDate, ORIGIN_LABELS } from "../_lib/labels";
import { adminPaths } from "../_lib/paths";
import { missingPublishCredits, ownerNames, publishBlockers } from "../_lib/service";

export const metadata: Metadata = { title: "תור אישורים" };
export const dynamic = "force-dynamic";

export default async function AdminQueuePage() {
  const viewer = await requireAdminPage(adminPaths.queue());
  const repo = await getRepo();
  // Oldest request first, so nobody waits forever.
  const { books: listed } = await repo.listBooks({
    status: "pending",
    sort: "updated",
  });
  const [owners, books] = await Promise.all([
    ownerNames(repo),
    Promise.all(listed.reverse().map((book) => repo.getBookById(book.id))),
  ]);
  const pending = books.filter((book) => book !== null && book.status === "pending");
  const recordings = await pendingRecordings(repo);

  if (pending.length === 0 && recordings.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="התור ריק"
        description="אין ספרים או הקלטות שממתינים לאישור. ספר נכנס לתור כשיוצר מבקש לפרסם אותו, והקלטה כשמקליט מבקש לשתף אותה."
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {recordings.length > 0 ? (
        <section aria-labelledby="queue-recordings-heading" className="flex flex-col gap-4">
          <h2 id="queue-recordings-heading" className="text-2xl font-bold">
            הקלטות שממתינות לשיתוף ({recordings.length})
          </h2>
          <ul className="flex flex-col gap-4">
            {recordings.map(({ recording, book }) => (
              <Card as="li" key={recording.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CardTitle>
                    <span aria-hidden="true">🎙️ </span>
                    {recording.title}
                  </CardTitle>
                  <Chip>
                    {recording.pages.length} מתוך {book.pages.length} עמודים
                  </Chip>
                </div>
                <p className="text-sm text-muted">
                  הספר:{" "}
                  <Link href={adminPaths.book(book.id)} className="font-semibold underline">
                    {book.title}
                  </Link>
                  {" · "}
                  מקליט: {owners.get(recording.userId) ?? "משתמש לא ידוע"}
                  {" · "}
                  נשלחה: {formatDate(recording.submittedAt ?? recording.updatedAt)}
                </p>
                <details className="rounded-md bg-surface-2 p-3">
                  <summary className="cursor-pointer font-semibold">האזנה לעמודים</summary>
                  <ol className="mt-3 flex flex-col gap-2">
                    {recording.pages.map((page) => (
                      <li key={page.index} className="flex flex-wrap items-center gap-3">
                        <span className="w-16 shrink-0 text-sm text-muted">עמוד {page.index + 1}</span>
                        <audio
                          controls
                          preload="none"
                          src={mediaUrl(page.audio, recording.updatedAt)}
                          className="h-10 max-w-full"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{book.pages[page.index]?.text}</span>
                      </li>
                    ))}
                  </ol>
                </details>
                <RecordingReviewActions
                  recordingId={recording.id}
                  title={recording.title}
                  updatedAt={recording.updatedAt}
                />
              </Card>
            ))}
          </ul>
        </section>
      ) : null}
      {pending.length > 0 ? (
        <section aria-labelledby="queue-heading" className="flex flex-col gap-4">
          <h2 id="queue-heading" className="text-2xl font-bold">
            ספרים שממתינים לאישור ({pending.length})
          </h2>
          <ul className="flex flex-col gap-4">
            {pending.map((book) => {
              if (!book) return null;
              const owner =
                book.ownerId === SYSTEM_OWNER_ID ? "ספריית האתר" : (owners.get(book.ownerId) ?? "משתמש לא ידוע");
              return (
                <Card as="li" key={book.id} className="flex flex-col gap-4 sm:flex-row">
                  <Link
                    href={adminPaths.book(book.id)}
                    className="block aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-md bg-surface-2"
                    aria-label={`תצוגה מקדימה של ${book.title}`}
                  >
                    {book.coverImage ? (
                      <img
                        src={mediaUrl(book.coverImage, book.updatedAt)}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-4xl" aria-hidden="true">
                        📖
                      </span>
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <CardTitle>{book.title}</CardTitle>
                    {book.summary ? <p className="line-clamp-2 text-muted">{book.summary}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Chip>{ageGroupLabel(book.ageGroup)}</Chip>
                      <Chip>{book.pages.length} עמודים</Chip>
                      <Chip>{readingTimeLabel(book.readingMinutes)}</Chip>
                      <Chip tone={book.origin === "ai" ? "warning" : "neutral"}>{ORIGIN_LABELS[book.origin]}</Chip>
                    </div>
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="inline text-muted">יוצר: </dt>
                        <dd className="inline">{owner}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted">עודכן: </dt>
                        <dd className="inline">{formatDate(book.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted">רישיון: </dt>
                        <dd className="inline">{book.license || "חסר"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted">מקור: </dt>
                        <dd className="inline break-words">{book.source || "חסר"}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col gap-3 sm:w-56">
                    <ButtonLink href={adminPaths.book(book.id)} variant="outline" size="sm">
                      תצוגה מקדימה
                    </ButtonLink>
                    <ReviewActions
                      bookId={book.id}
                      title={book.title}
                      blockers={publishBlockers(book)}
                      missingCredits={missingPublishCredits(book)}
                      canWaiveCredits={viewer.role === "admin"}
                      updatedAt={book.updatedAt}
                    />
                  </div>
                </Card>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Recordings waiting for sharing, oldest request first, with their books. */
async function pendingRecordings(
  repo: Awaited<ReturnType<typeof getRepo>>,
): Promise<{ recording: Recording; book: BookWithPages }[]> {
  const listed = await repo.listRecordings({ status: "pending" });
  listed.sort((a, b) => (a.submittedAt ?? a.updatedAt).localeCompare(b.submittedAt ?? b.updatedAt));
  const rows = await Promise.all(
    listed.map(async (recording) => {
      const book = await repo.getBookById(recording.bookId);
      return book ? { recording, book } : null;
    }),
  );
  return rows.filter((row): row is { recording: Recording; book: BookWithPages } => row !== null);
}
