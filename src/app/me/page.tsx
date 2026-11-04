import type { Metadata } from "next";
import Link from "next/link";
import { CloudDownload, Headphones, Mic, Pencil, Plus } from "lucide-react";
import { MyRecordingActions } from "@/components/personal/MyRecordingActions";
import { PersonalLibrary } from "@/components/personal/PersonalLibrary";
import { PersonalSync } from "@/components/personal/PersonalSync";
import { ShareControls } from "@/components/personal/ShareControls";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { ButtonLink, Card, Chip, EmptyState, type ChipTone } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { accountMessages } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import type { Book, BookStatus, BookWithPages, Recording, RecordingStatus } from "@/lib/types";
import { localizeTitle } from "@/lib/i18n/metadata";

const HEBREW_METADATA: Metadata = {
  title: "המדף שלי",
  robots: { index: false },
};

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "My shelf");
}

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<BookStatus, ChipTone> = {
  draft: "neutral",
  private: "secondary",
  pending: "warning",
  published: "success",
};

const RECORDING_TONE: Record<RecordingStatus, ChipTone> = {
  private: "neutral",
  pending: "warning",
  approved: "success",
};

function MyRecordingRow({ recording, book, locale }: { recording: Recording; book: BookWithPages; locale: Locale }) {
  const t = accountMessages(locale).me;
  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold">
          <span aria-hidden="true">🎙️ </span>
          <bdi dir="auto">{recording.title}</bdi>
        </h3>
        <Chip tone={RECORDING_TONE[recording.status]}>{t.recordingStatus[recording.status]}</Chip>
      </div>
      <p className="text-sm text-muted">
        <bdi dir="auto">{book.title}</bdi> · {t.recordedPages(recording.pages.length, book.pages.length)}
      </p>
      {recording.reviewNote && recording.status === "private" ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
          <span className="font-semibold">{t.editorNote}</span>
          <bdi dir="auto">{recording.reviewNote}</bdi>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {recording.pages.length > 0 ? (
          <ButtonLink href={routes.readVoice(book.slug, recording.id)} size="sm">
            <Headphones aria-hidden="true" className="size-4" />
            {t.listen}
          </ButtonLink>
        ) : null}
        <ButtonLink href={routes.read(book.slug)} variant="outline" size="sm">
          <Mic aria-hidden="true" className="size-4" />
          {t.keepRecording}
        </ButtonLink>
        <MyRecordingActions
          id={recording.id}
          title={recording.title}
          status={recording.status}
          canShare={book.status === "published" && recording.pages.length > 0}
        />
      </div>
    </Card>
  );
}

function MyBookRow({ book, locale }: { book: Book; locale: Locale }) {
  const t = accountMessages(locale).me;
  const status = t.status[book.status];
  const dateFormat = new Intl.DateTimeFormat(accountMessages(locale).dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const cover = mediaUrl(book.coverImage, book.updatedAt);
  return (
    <Card as="li" className="flex flex-col gap-4 sm:flex-row">
      <Link
        href={routes.read(book.slug)}
        className="relative block aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2"
        aria-label={t.readBookAria(book.title)}
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
          <h3 className="text-xl font-bold" dir="auto">
            {book.title}
          </h3>
          <Chip tone={STATUS_TONE[book.status]}>{status.label}</Chip>
        </div>
        <p className="text-sm text-muted">
          {status.hint} {t.updated(dateFormat.format(new Date(book.updatedAt)))}
        </p>
        {book.reviewNote && book.status !== "published" ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
            <span className="font-semibold">{t.editorNote}</span>
            <bdi dir="auto">{book.reviewNote}</bdi>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={routes.read(book.slug)} size="sm">
            {t.read}
          </ButtonLink>
          <ButtonLink href={routes.studioBook(book.id)} variant="outline" size="sm">
            <Pencil aria-hidden="true" className="size-4" />
            {t.edit}
          </ButtonLink>
          <OfflineDownloadButton bookId={book.id} title={book.title} size="sm" />
        </div>
        {book.status === "published" ? (
          <p className="text-sm text-muted">
            {t.publicBefore}{" "}
            <Link href={routes.book(book.slug)} className="font-semibold underline">
              {t.publicLink}
            </Link>{" "}
            {t.publicAfter}
          </p>
        ) : (
          <ShareControls bookId={book.id} title={book.title} initialToken={book.shareToken ?? null} />
        )}
      </div>
    </Card>
  );
}

/** The reader's own recordings with their books (recordings of books they can no longer see are left out). */
async function loadMyRecordings(userId: string): Promise<{ recording: Recording; book: BookWithPages }[]> {
  const repo = await getRepo();
  const recordings = await repo.listRecordings({ userId });
  const rows = await Promise.all(
    recordings.map(async (recording) => {
      const book = await repo.getBookById(recording.bookId);
      return book && (book.status === "published" || book.ownerId === userId) ? { recording, book } : null;
    }),
  );
  return rows.filter((row): row is { recording: Recording; book: BookWithPages } => row !== null);
}

export default async function MePage() {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const t = accountMessages(locale).me;
  const repo = await getRepo();
  const [myBooks, myRecordings] = user
    ? await Promise.all([
        repo.listBooks({ ownerId: user.id, status: "any", sort: "updated" }).then((result) => result.books),
        loadMyRecordings(user.id),
      ])
    : [[], []];

  return (
    <main className="container-page flex flex-col gap-12 py-8">
      <PersonalSync userId={user?.id ?? null} quiet />

      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-extrabold">{user ? t.titleOf(user.name) : t.title}</h1>
        {user ? (
          <p className="text-lg text-muted">{t.intro}</p>
        ) : (
          <Card tone="soft" className="flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1 text-lg">{t.anonymousIntro}</p>
            <ButtonLink href={routes.login(routes.me())} variant="secondary">
              {t.signIn}
            </ButtonLink>
          </Card>
        )}
      </header>

      <PersonalLibrary signedIn={!!user} />

      <section aria-labelledby="my-books-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="my-books-title" className="text-2xl font-extrabold">
            <span aria-hidden="true">🎨 </span>
            {t.myBooks}
          </h2>
          {user ? (
            <ButtonLink href={routes.studioNew()} variant="secondary" size="sm">
              <Plus aria-hidden="true" className="size-4" />
              {t.newBook}
            </ButtonLink>
          ) : null}
        </div>
        {!user ? (
          <EmptyState
            icon="🎨"
            title={t.signedOutBooksTitle}
            description={t.signedOutBooksDescription}
            action={<ButtonLink href={routes.login(routes.me())}>{t.signIn}</ButtonLink>}
          />
        ) : myBooks.length === 0 ? (
          <EmptyState
            icon="✏️"
            title={t.noBooksTitle}
            description={t.noBooksDescription}
            action={<ButtonLink href={routes.studio()}>{t.toStudio}</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {myBooks.map((book) => (
              <MyBookRow key={book.id} book={book} locale={locale} />
            ))}
          </ul>
        )}
      </section>

      {myRecordings.length > 0 ? (
        <section aria-labelledby="my-recordings-title" className="flex flex-col gap-4">
          <h2 id="my-recordings-title" className="text-2xl font-extrabold">
            <span aria-hidden="true">🎙️ </span>
            {t.myRecordings}
          </h2>
          <p className="text-muted">{t.recordingsIntro}</p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {myRecordings.map(({ recording, book }) => (
              <MyRecordingRow key={recording.id} recording={recording} book={book} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="device-title" className="flex flex-col gap-4">
        <h2 id="device-title" className="text-2xl font-extrabold">
          <span aria-hidden="true">📱 </span>
          {t.onThisDevice}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/offline" variant="outline">
            <CloudDownload aria-hidden="true" className="size-5" />
            {t.offlineBooks}
          </ButtonLink>
          <InstallPrompt variant="inline" />
        </div>
      </section>
    </main>
  );
}
