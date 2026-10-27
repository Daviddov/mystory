/**
 * Data and queue logic of the bedtime "radio" (/listen). Pure and client-safe:
 * the page builds the tracks on the server, the player walks through them.
 */
import { contentTypeForPath, mediaUrl } from "@/lib/media/url";
import { AGE_GROUPS, bookAgeGroups, type AgeGroup, type BookWithPages } from "@/lib/types";

export interface ListenPage {
  /** 1-based page number in the book (pages without audio are skipped, so numbers may jump). */
  number: number;
  audioUrl: string;
}

export interface ListenTrack {
  id: string;
  slug: string;
  title: string;
  author: string;
  ageGroup: AgeGroup;
  /** Every age group the book suits (see bookAgeGroups()). */
  ageGroups: AgeGroup[];
  readingMinutes: number;
  /** Browser URL of the cover, or "" when the book has none. */
  coverUrl: string;
  /** MIME type of the cover, for the lock-screen artwork. */
  coverType: string;
  pages: ListenPage[];
  /** True when any page is narrated by the silent demo voice. The UI must say so. */
  hasMockAudio: boolean;
}

/** A book becomes a track when it is published and at least one page has narration. */
export function buildListenTracks(books: BookWithPages[]): ListenTrack[] {
  const tracks: ListenTrack[] = [];
  for (const book of books) {
    if (book.status !== "published") continue;
    const narrated = [...book.pages].sort((a, b) => a.index - b.index).filter((page) => !!page.audio);
    if (narrated.length === 0) continue;
    tracks.push({
      id: book.id,
      slug: book.slug,
      title: book.title,
      author: book.author,
      ageGroup: book.ageGroup,
      ageGroups: bookAgeGroups(book),
      readingMinutes: book.readingMinutes,
      coverUrl: mediaUrl(book.coverImage, book.updatedAt),
      coverType: book.coverImage ? contentTypeForPath(book.coverImage) : "",
      pages: narrated.map((page) => ({
        number: page.index + 1,
        audioUrl: mediaUrl(page.audio, book.updatedAt),
      })),
      hasMockAudio: narrated.some((page) => page.audioSource === "mock"),
    });
  }
  return tracks;
}

export type AgeFilter = AgeGroup | "all";

export function parseAgeFilter(value: string | null | undefined): AgeFilter {
  return (AGE_GROUPS as readonly string[]).includes(value ?? "") ? (value as AgeGroup) : "all";
}

export function filterTracks(tracks: ListenTrack[], age: AgeFilter): ListenTrack[] {
  return age === "all" ? tracks : tracks.filter((track) => track.ageGroups.includes(age));
}

/** Where the player is: a story in the queue and a narrated page inside it. */
export interface QueuePosition {
  track: number;
  page: number;
}

export interface Advance {
  position: QueuePosition;
  /** True when the step crossed into another story (or wrapped around the queue). */
  storyEnded: boolean;
}

/** The page after `position`. After the last page of the last story the queue starts over. */
export function nextPage(queue: ListenTrack[], position: QueuePosition): Advance | null {
  const track = queue[position.track];
  if (!track) return null;
  if (position.page + 1 < track.pages.length) {
    return { position: { track: position.track, page: position.page + 1 }, storyEnded: false };
  }
  return { position: { track: (position.track + 1) % queue.length, page: 0 }, storyEnded: true };
}

/** First page of the next story (wraps around). */
export function nextStory(queue: ListenTrack[], position: QueuePosition): QueuePosition | null {
  if (queue.length === 0) return null;
  return { track: (position.track + 1) % queue.length, page: 0 };
}

/**
 * "Previous" like a music player: back to the start of this story, or to the
 * previous story when already at its start.
 */
export function previousStory(queue: ListenTrack[], position: QueuePosition, secondsIntoPage = 0): QueuePosition | null {
  if (queue.length === 0) return null;
  if (position.page > 0 || secondsIntoPage > 3) return { track: position.track, page: 0 };
  return { track: (position.track - 1 + queue.length) % queue.length, page: 0 };
}

/** "12:05" for the sleep timer. */
export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Volume multiplier for the sleep timer: full volume, then a linear fade over the last seconds. */
export function fadeVolume(secondsLeft: number, fadeSeconds = 20): number {
  if (secondsLeft >= fadeSeconds) return 1;
  return Math.min(1, Math.max(0, secondsLeft / fadeSeconds));
}
