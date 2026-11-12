import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, Clock, Printer } from "lucide-react";
import { BookCredits } from "@/components/BookCredits";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { ButtonLink, Card, Chip } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { accountMessages } from "@/lib/i18n/account";
import { ageGroupsText, readingTimeText } from "@/lib/i18n/labels";
import { getLocale } from "@/lib/i18n/server";
import { getAgeGroup } from "@/lib/taxonomy";
import { bookAgeGroups, type BookWithPages } from "@/lib/types";
import { localizeTitle } from "@/lib/i18n/metadata";
import { plainText, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

async function loadSharedBook(token: string): Promise<BookWithPages | null> {
  if (!TOKEN_RE.test(token)) return null;
  const repo = await getRepo();
  const book = await repo.getBookByShareToken(token);
  // Defence in depth: the repository lookup must return the book that carries exactly this token.
  return book && book.shareToken === token ? book : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await loadSharedBook((await params).token);
  const description = book ? plainText(book.summary, 155) || undefined : undefined;
  return localizeTitle({
    title: book ? book.title : "ספר משותף",
    description,
    // The share image is drawn from the cover by ./opengraph-image.ts.
    openGraph: book
      ? { title: book.title, description, type: "book", locale: "he_IL", siteName: SITE_NAME }
      : undefined,
    twitter: book ? { card: "summary_large_image", title: book.title, description } : undefined,
    // A share link is a secret: keep it out of search engines and out of Referer headers.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  }, book ? book.title : "Shared book");
}

/** Public landing page of a share link: the cover and one big "read" button. */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const book = await loadSharedBook(token);
  if (!book) notFound();
  const locale = await getLocale();
  const t = accountMessages(locale).share;

  // The cover of an unpublished book is served only with the share token (see /media).
  const cover = mediaUrl(book.coverImage, book.updatedAt, book.status === "published" ? undefined : token);
  const ages = bookAgeGroups(book);
  const age = getAgeGroup(ages[0]);
  const isPublic = book.status === "published";
  // The reader receives the token so it can show a book that is not published.
  const readHref = isPublic
    ? routes.read(book.slug)
    : `${routes.read(book.slug)}?token=${encodeURIComponent(token)}`;

  return (
    <main className="container-page flex flex-col items-center gap-6 py-8 sm:py-12">
      <Card padding="lg" className="flex w-full max-w-3xl flex-col items-center gap-8 sm:flex-row sm:items-start">
        <div className="aspect-[3/4] w-56 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2 shadow-card sm:w-64">
          {cover ? (
            <img src={cover} alt={t.coverAlt(book.title)} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-7xl" aria-hidden="true">
              📖
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-4 text-center sm:items-start sm:text-start">
          <p className="font-semibold text-secondary">{t.sharedWithYou}</p>
          <h1 className="text-4xl font-extrabold leading-tight" dir="auto">
            {book.title}
          </h1>
          {book.author ? (
            <p className="text-lg text-muted">
              {t.by}
              <bdi dir="auto">{book.author}</bdi>
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {age ? <Chip icon={age.emoji}>{ageGroupsText(locale, ages)}</Chip> : null}
            <Chip icon={<Clock aria-hidden="true" className="size-4" />}>{readingTimeText(locale, book.readingMinutes)}</Chip>
            <Chip>{t.pages(book.pages.length)}</Chip>
          </div>
          {book.summary ? (
            <p className="text-lg leading-relaxed" dir="auto">
              {book.summary}
            </p>
          ) : null}

          {book.pages.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <ButtonLink href={readHref} size="lg">
                <BookOpen aria-hidden="true" className="size-6" />
                {t.read}
              </ButtonLink>
              <OfflineDownloadButton bookId={book.id} title={book.title} token={isPublic ? undefined : token} />
              <ButtonLink href={routes.print(book.slug, isPublic ? undefined : token)} variant="outline">
                <Printer aria-hidden="true" className="size-5" />
                {t.print}
              </ButtonLink>
            </div>
          ) : (
            <p className="rounded-md bg-warning-soft px-4 py-3">{t.noPages}</p>
          )}

          {isPublic ? null : (
            <p className="text-sm text-muted">{t.privateNote}</p>
          )}
        </div>
      </Card>
      <BookCredits book={book} variant="compact" className="w-full max-w-3xl" mediaToken={isPublic ? undefined : token} />
    </main>
  );
}
