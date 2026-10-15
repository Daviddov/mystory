import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { missingPublishCredits, publishBlockers } from "@/app/admin/_lib/service";
import { ReaderPublishPanel } from "@/components/admin/ReaderPublishPanel";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { BookPlayer } from "@/components/reader";
import { loadBookForReader, loadServerProgress, recommendBooks } from "@/lib/reader/access";
import { toPlayerBook } from "@/lib/reader/logic";
import { recordingsForReader } from "@/lib/recordings/service";
import { hasRole } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface ReadPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

const QuerySchema = z.object({
  /** 1-based page number, as in routes.read(slug, page). */
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  /** Share token of a private book. */
  token: z.string().min(1).max(128).optional().catch(undefined),
  /** "1" when opened through the "listen" button: start the narration. */
  listen: z.literal("1").optional().catch(undefined),
  /** Family recording to listen to. */
  voice: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional().catch(undefined),
  /** "1" when opened from the book's card: ask how to start. */
  start: z.literal("1").optional().catch(undefined),
});

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(searchParams: SearchParams) {
  return QuerySchema.parse({
    page: first(searchParams.page) || undefined,
    token: first(searchParams.token) || undefined,
    listen: first(searchParams.listen) || undefined,
    start: first(searchParams.start) || undefined,
    voice: first(searchParams.voice) || undefined,
  });
}

export async function generateMetadata({ params, searchParams }: ReadPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { token } = parseQuery(await searchParams);
  const result = await loadBookForReader(slug, token);
  if (!result.ok) return { title: "הספר לא נמצא", robots: { index: false, follow: false } };
  const { book } = result;
  if (book.status !== "published") {
    // Private books stay out of search engines, and the share token out of Referer headers.
    return { title: `קוראים: ${book.title}`, robots: { index: false, follow: false }, referrer: "no-referrer" };
  }
  return {
    title: `קוראים: ${book.title}`,
    description: book.summary || undefined,
    alternates: { canonical: routes.read(book.slug) },
  };
}

export default async function ReadPage({ params, searchParams }: ReadPageProps) {
  const { slug } = await params;
  const query = parseQuery(await searchParams);

  // Access is decided on the server: published books are public, anything else
  // needs its owner, an editor, or the book's share token.
  const result = await loadBookForReader(slug, query.token);
  if (!result.ok) notFound();
  const { book, user, isOwnerOrStaff, viaToken } = result;

  const [serverProgress, recommendations, recordings] = await Promise.all([
    query.page === undefined ? loadServerProgress(user, book.id) : null,
    recommendBooks(book),
    getRepo().then((repo) => recordingsForReader(repo, book.id, user)),
  ]);

  const exitHref =
    book.status === "published" ? routes.book(book.slug) : isOwnerOrStaff ? routes.studioBook(book.id) : routes.home();

  // An editor who reads an unpublished book to the end can publish it right there.
  const publishPanel =
    book.status !== "published" && hasRole(user, "editor") ? (
      <ReaderPublishPanel
        bookId={book.id}
        slug={book.slug}
        title={book.title}
        status={book.status}
        blockers={publishBlockers(book)}
        missingCredits={missingPublishCredits(book)}
        canWaiveCredits={hasRole(user, "admin")}
        updatedAt={book.updatedAt}
      />
    ) : undefined;

  return (
    <BookPlayer
      book={toPlayerBook(book)}
      initialPage={query.page === undefined ? undefined : query.page - 1}
      serverProgress={serverProgress}
      recommendations={recommendations}
      exitHref={exitHref}
      syncProgress={user !== null}
      recordings={recordings}
      initialVoice={query.voice}
      recorder={{
        signedIn: user !== null,
        loginHref: routes.login(routes.read(book.slug)),
        canShare: book.status === "published",
      }}
      shareToken={viaToken ? query.token : undefined}
      syncUrl
      autoNarrate={query.listen === "1"}
      startScreen={query.start === "1" && query.page === undefined}
      downloadControl={
        <OfflineDownloadButton
          bookId={book.id}
          title={book.title}
          token={viaToken ? query.token : undefined}
          size="lg"
        />
      }
      countView={book.status === "published"}
      endScreenStaffPanel={publishPanel}
    />
  );
}
