/**
 * /listen: the bedtime "radio". A continuous queue of every published book
 * that has narration, with an age filter and a sleep timer.
 *
 *   ?age=0-2 | 3-5 | 6-8    start with that age filter selected
 */
import type { Metadata } from "next";
import { ListenPlayer } from "@/components/listen/ListenPlayer";
import { buildListenTracks, parseAgeFilter } from "@/components/listen/tracks";
import { ButtonLink, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import type { BookWithPages } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "סיפורים לפני השינה להאזנה: סיפורי ילדים מוקלטים",
  description:
    "סיפורי ילדים לשמיעה בחינם: רצף סיפורים מוקלטים להאזנה לפני השינה. בוחרים גיל, מכוונים טיימר שינה ומקשיבים בעיניים עצומות.",
  path: routes.listen(),
});

/** Upper bound on the queue, so the page stays light. */
const MAX_BOOKS = 150;

async function loadNarratedBooks(): Promise<BookWithPages[]> {
  const repo = await getRepo();
  const { books } = await repo.listBooks({ status: "published", sort: "popular", limit: MAX_BOOKS });
  const full = await Promise.all(books.map((book) => repo.getBookById(book.id)));
  return full.filter((book): book is BookWithPages => book !== null);
}

export default async function ListenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawAge = Array.isArray(params.age) ? params.age[0] : params.age;
  const tracks = buildListenTracks(await loadNarratedBooks());
  // The playlist is per user; null means nobody is signed in and the playlist features are hidden.
  const user = await getCurrentUser();
  const playlistIds = user
    ? await (await getRepo())
        .listPlaylist(user.id)
        .then((items) => items.map((item) => item.bookId))
        .catch(() => [])
    : null;

  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">
          <span aria-hidden="true">🎧 </span>
          סיפורים להאזנה לפני השינה
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          סיפור אחרי סיפור, בלי לגעת במסך. אפשר לכבות את המסך והסיפורים ימשיכו להתנגן, עד שטיימר השינה יעצור אותם.
        </p>
      </header>

      {tracks.length === 0 ? (
        <EmptyState
          icon="🌙"
          title="עדיין אין סיפורים מוקלטים"
          description="הרצף מתמלא מספרים בספרייה שיש להם הקראה, ועדיין לא הוקלט אף ספר. בינתיים אפשר לקרוא יחד מהספרייה."
          action={<ButtonLink href={routes.books()}>לכל הספרים</ButtonLink>}
        />
      ) : (
        <ListenPlayer tracks={tracks} initialAge={parseAgeFilter(rawAge)} playlistIds={playlistIds} />
      )}
    </main>
  );
}
