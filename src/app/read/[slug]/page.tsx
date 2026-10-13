import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BookPlayer } from "@/components/reader";
import { loadBookForReader, loadServerProgress, recommendBooks } from "@/lib/reader/access";
import { toPlayerBook } from "@/lib/reader/logic";
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
});

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(searchParams: SearchParams) {
  return QuerySchema.parse({
    page: first(searchParams.page) || undefined,
    token: first(searchParams.token) || undefined,
    listen: first(searchParams.listen) || undefined,
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

  const [serverProgress, recommendations] = await Promise.all([
    query.page === undefined ? loadServerProgress(user, book.id) : null,
    recommendBooks(book),
  ]);

  const exitHref =
    book.status === "published" ? routes.book(book.slug) : isOwnerOrStaff ? routes.studioBook(book.id) : routes.home();

  return (
    <BookPlayer
      book={toPlayerBook(book)}
      initialPage={query.page === undefined ? undefined : query.page - 1}
      serverProgress={serverProgress}
      recommendations={recommendations}
      exitHref={exitHref}
      syncProgress={user !== null}
      shareToken={viaToken ? query.token : undefined}
      syncUrl
      autoNarrate={query.listen === "1"}
      countView={book.status === "published"}
    />
  );
}
