/**
 * /listen: the bedtime "radio". A continuous queue of every published book
 * that has narration, with an age filter and a sleep timer.
 *
 *   ?age=0-2 | 3-5 | 6-8    start with that age filter selected
 *
 * Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
 * ?age= and signed-in visitors go to the dynamic twin in src/app/live, which
 * renders ListenView with the real values.
 */
import type { Metadata } from "next";
import { ListenPlayer } from "@/components/listen/ListenPlayer";
import { buildListenTracks, parseAgeFilter } from "@/components/listen/tracks";
import { ButtonLink, EmptyState } from "@/components/ui";
import { libraryMessages } from "@/lib/i18n/library";
import { getLocale } from "@/lib/i18n/server";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import type { BookWithPages, User } from "@/lib/types";
import { localizeTitle } from "@/lib/i18n/metadata";

export const dynamic = "force-static";
export const revalidate = 600;

const HEBREW_METADATA: Metadata = pageMetadata({
  title: "סיפורים לפני השינה להאזנה: סיפורי ילדים מוקלטים",
  description:
    "סיפורי ילדים לשמיעה בחינם: רצף סיפורים מוקלטים להאזנה לפני השינה. בוחרים גיל, מכוונים טיימר שינה ומקשיבים בעיניים עצומות.",
  path: routes.listen(),
});

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "Bedtime stories to listen to: recorded children's stories");
}

/** Upper bound on the queue, so the page stays light. */
const MAX_BOOKS = 150;

async function loadNarratedBooks(): Promise<BookWithPages[]> {
  const repo = await getRepo();
  const { books } = await repo.listBooks({ status: "published", language: "he", sort: "popular", limit: MAX_BOOKS });
  const full = await Promise.all(books.map((book) => repo.getBookById(book.id)));
  return full.filter((book): book is BookWithPages => book !== null);
}

export default function ListenPage() {
  return ListenView({ age: undefined, viewer: null });
}

/** The page itself: `age` is the raw ?age= value, `viewer` the signed-in user. */
export async function ListenView({ age, viewer }: { age: string | undefined; viewer: User | null }) {
  const tracks = buildListenTracks(await loadNarratedBooks());
  // The playlist is per user; null means nobody is signed in and the playlist features are hidden.
  const playlistIds = viewer
    ? await (await getRepo())
        .listPlaylist(viewer.id)
        .then((items) => items.map((item) => item.bookId))
        .catch(() => [])
    : null;
  const t = libraryMessages(await getLocale()).listen;

  return (
    <main className="container-page flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">
          <span aria-hidden="true">🎧 </span>
          {t.title}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">{t.lead}</p>
      </header>

      {tracks.length === 0 ? (
        <EmptyState
          icon="🌙"
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={<ButtonLink href={routes.books()}>{t.allBooks}</ButtonLink>}
        />
      ) : (
        <ListenPlayer tracks={tracks} initialAge={parseAgeFilter(age)} playlistIds={playlistIds} />
      )}
    </main>
  );
}
