import type { Metadata } from "next";
import Link from "next/link";
import { CloudDownload, Pencil, Plus } from "lucide-react";
import { PersonalLibrary } from "@/components/personal/PersonalLibrary";
import { PersonalSync } from "@/components/personal/PersonalSync";
import { ShareControls } from "@/components/personal/ShareControls";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { ButtonLink, Card, Chip, EmptyState, type ChipTone } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import type { Book, BookStatus } from "@/lib/types";

export const metadata: Metadata = { title: "המדף שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<BookStatus, { label: string; tone: ChipTone; hint: string }> = {
  draft: { label: "טיוטה", tone: "neutral", hint: "רק אתם רואים את הספר." },
  private: { label: "פרטי", tone: "secondary", hint: "רק אתם רואים את הספר, ומי שקיבל מכם קישור שיתוף." },
  pending: { label: "ממתין לאישור", tone: "warning", hint: "הספר נשלח לעורך ויופיע בספרייה אחרי אישור." },
  published: { label: "פורסם בספרייה", tone: "success", hint: "הספר פתוח לכולם בספרייה." },
};

const dateFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" });

function MyBookRow({ book }: { book: Book }) {
  const status = STATUS[book.status];
  const cover = mediaUrl(book.coverImage, book.updatedAt);
  return (
    <Card as="li" className="flex flex-col gap-4 sm:flex-row">
      <Link
        href={routes.read(book.slug)}
        className="relative block aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2"
        aria-label={`קריאת הספר ${book.title}`}
      >
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-5xl" aria-hidden="true">
            📖
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-xl font-bold">{book.title}</h3>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
        <p className="text-sm text-muted">
          {status.hint} עודכן ב-{dateFormat.format(new Date(book.updatedAt))}.
        </p>
        {book.reviewNote && book.status !== "published" ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
            <span className="font-semibold">הערת העורך: </span>
            {book.reviewNote}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={routes.read(book.slug)} size="sm">
            קריאה
          </ButtonLink>
          <ButtonLink href={routes.studioBook(book.id)} variant="outline" size="sm">
            <Pencil aria-hidden="true" className="size-4" />
            עריכה
          </ButtonLink>
          <OfflineDownloadButton bookId={book.id} title={book.title} size="sm" />
        </div>
        {book.status === "published" ? (
          <p className="text-sm text-muted">
            הספר ציבורי, ואפשר לשתף את{" "}
            <Link href={routes.book(book.slug)} className="font-semibold underline">
              עמוד הספר
            </Link>{" "}
            כמו שהוא.
          </p>
        ) : (
          <ShareControls bookId={book.id} title={book.title} initialToken={book.shareToken ?? null} />
        )}
      </div>
    </Card>
  );
}

export default async function MePage() {
  const user = await getCurrentUser();
  const myBooks = user
    ? (await (await getRepo()).listBooks({ ownerId: user.id, status: "any", sort: "updated" })).books
    : [];

  return (
    <main className="container-page flex flex-col gap-12 py-8">
      <PersonalSync userId={user?.id ?? null} quiet />

      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-extrabold">{user ? `המדף של ${user.name}` : "המדף שלי"}</h1>
        {user ? (
          <p className="text-lg text-muted">הספרים שאתם קוראים, אוהבים ויוצרים, בכל מכשיר שבו אתם מחוברים.</p>
        ) : (
          <Card tone="soft" className="flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1 text-lg">
              המועדפים והמקום שבו עצרתם נשמרים במכשיר הזה בלבד. אחרי כניסה לחשבון הם יעברו אליו, ויחכו לכם בכל
              מכשיר.
            </p>
            <ButtonLink href={routes.login(routes.me())} variant="secondary">
              כניסה לחשבון
            </ButtonLink>
          </Card>
        )}
      </header>

      <PersonalLibrary signedIn={!!user} />

      <section aria-labelledby="my-books-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="my-books-title" className="text-2xl font-extrabold">
            <span aria-hidden="true">🎨 </span>
            הספרים שיצרתי
          </h2>
          {user ? (
            <ButtonLink href={routes.studioNew()} variant="secondary" size="sm">
              <Plus aria-hidden="true" className="size-4" />
              ספר חדש
            </ButtonLink>
          ) : null}
        </div>
        {!user ? (
          <EmptyState
            icon="🎨"
            title="כאן יופיעו הספרים שלכם"
            description="אחרי כניסה לחשבון אפשר ליצור ספרים, לשמור אותם פרטיים ולשתף אותם בקישור."
            action={<ButtonLink href={routes.login(routes.me())}>כניסה לחשבון</ButtonLink>}
          />
        ) : myBooks.length === 0 ? (
          <EmptyState
            icon="✏️"
            title="עדיין לא יצרתם ספר"
            description="בסטודיו אפשר להעלות תמונות וטקסט ולהפוך אותם לספר, או ליצור ספר אישי."
            action={<ButtonLink href={routes.studio()}>לסטודיו</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {myBooks.map((book) => (
              <MyBookRow key={book.id} book={book} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="device-title" className="flex flex-col gap-4">
        <h2 id="device-title" className="text-2xl font-extrabold">
          <span aria-hidden="true">📱 </span>
          במכשיר הזה
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/offline" variant="outline">
            <CloudDownload aria-hidden="true" className="size-5" />
            ספרים שהורדתי לקריאה בלי רשת
          </ButtonLink>
          <InstallPrompt variant="inline" />
        </div>
      </section>
    </main>
  );
}
