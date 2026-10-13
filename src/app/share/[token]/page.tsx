import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, Clock, Printer } from "lucide-react";
import { BookCredits } from "@/components/BookCredits";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { ButtonLink, Card, Chip } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { getAgeGroup, readingTimeLabel } from "@/lib/taxonomy";
import type { BookWithPages } from "@/lib/types";

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
  return {
    title: book ? book.title : "ספר משותף",
    // A share link is a secret: keep it out of search engines and out of Referer headers.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** Public landing page of a share link: the cover and one big "read" button. */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const book = await loadSharedBook(token);
  if (!book) notFound();

  // The cover of an unpublished book is served only with the share token (see /media).
  const cover = mediaUrl(book.coverImage, book.updatedAt, book.status === "published" ? undefined : token);
  const age = getAgeGroup(book.ageGroup);
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
            <img src={cover} alt={`כריכת הספר ${book.title}`} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-7xl" aria-hidden="true">
              📖
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-4 text-center sm:items-start sm:text-start">
          <p className="font-semibold text-secondary">שיתפו איתכם ספר</p>
          <h1 className="text-4xl font-extrabold leading-tight">{book.title}</h1>
          {book.author ? <p className="text-lg text-muted">מאת {book.author}</p> : null}
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {age ? <Chip icon={age.emoji}>{age.label}</Chip> : null}
            <Chip icon={<Clock aria-hidden="true" className="size-4" />}>{readingTimeLabel(book.readingMinutes)}</Chip>
            <Chip>{book.pages.length} עמודים</Chip>
          </div>
          {book.summary ? <p className="text-lg leading-relaxed">{book.summary}</p> : null}

          {book.pages.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <ButtonLink href={readHref} size="lg">
                <BookOpen aria-hidden="true" className="size-6" />
                בואו נקרא
              </ButtonLink>
              <OfflineDownloadButton bookId={book.id} title={book.title} token={isPublic ? undefined : token} />
              <ButtonLink href={routes.print(book.slug, isPublic ? undefined : token)} variant="outline">
                <Printer aria-hidden="true" className="size-5" />
                הדפסה ו-PDF
              </ButtonLink>
            </div>
          ) : (
            <p className="rounded-md bg-warning-soft px-4 py-3">בספר הזה עדיין אין עמודים.</p>
          )}

          {isPublic ? null : (
            <p className="text-sm text-muted">
              זהו ספר פרטי. הוא נפתח רק דרך הקישור הזה, ובעל הספר יכול לבטל את הקישור בכל רגע.
            </p>
          )}
        </div>
      </Card>
      <BookCredits book={book} variant="compact" className="w-full max-w-3xl" mediaToken={isPublic ? undefined : token} />
    </main>
  );
}
