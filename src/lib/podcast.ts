/**
 * Podcast shows built from the narrated books (Spotify, Apple Podcasts,
 * YouTube Music and Amazon Music all read the same RSS feed).
 *
 * An episode is one book's narration joined into a single MP3 with its
 * soundtrack underneath. scripts/export-media.ts makes the file, uploads it to
 * "podcast/<show>/<slug>.mp3" in the media store and records it in that
 * show's manifest, "podcast/<show>/episodes.json". The feed route
 * (src/app/podcast/[show]/feed.xml) reads the manifest and lists every
 * episode whose publish time has passed, so episodes can be queued ahead and
 * released on a schedule.
 *
 * Files outside "books/" are public site content (see media/access.ts), so
 * the /media route serves the episode files and covers to anyone.
 *
 * Client-safe: no Node imports.
 */
import { z } from "zod";

export const PODCAST_SHOWS = {
  bedtime: {
    title: "סיפור לפני השינה – הסיפור שלי",
    subtitle: "סיפורים מוקראים לילדים בעברית",
    description:
      "סיפורים מוקראים לילדים בעברית, עם מוזיקה שקטה ברקע. סיפור קצר לפני השינה, לנסיעה או לשעת מנוחה. " +
      "את כל הסיפורים אפשר גם לקרוא באתר, עם ניקוד ואיור בכל עמוד, בחינם.",
    category: "Kids & Family",
    subcategory: "Stories for Kids",
  },
  parasha: {
    title: "פרשת השבוע לילדים – הסיפור שלי",
    subtitle: "סיפור קצר לכל פרשה",
    description:
      "סיפור מוקרא לילדים על פרשת השבוע, פרק חדש לפני כל שבת. " +
      "כל סיפור מופיע גם באתר עם ניקוד, איורים ושאלות לשולחן השבת.",
    category: "Kids & Family",
    subcategory: "Stories for Kids",
  },
} as const;

export type PodcastShowId = keyof typeof PODCAST_SHOWS;

export function isPodcastShow(value: string): value is PodcastShowId {
  return Object.prototype.hasOwnProperty.call(PODCAST_SHOWS, value);
}

export const PodcastEpisodeSchema = z.object({
  bookId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1).max(200),
  /** Plain text (no nikud); the feed adds a link to the book. */
  description: z.string().max(4000),
  /** Media path of the MP3, e.g. "podcast/bedtime/<slug>.mp3". */
  audio: z.string().min(1),
  /** File size in bytes (the RSS enclosure needs it). */
  bytes: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  /** Media path of a square episode image (3000x3000 JPG), optional. */
  image: z.string().optional(),
  /** ISO time the episode goes live. Episodes in the future are left out of the feed. */
  publishAt: z.string().min(1),
  /** Stable id for podcast apps; never change it once published. */
  guid: z.string().min(1),
});
export type PodcastEpisode = z.infer<typeof PodcastEpisodeSchema>;

export const PodcastManifestSchema = z.object({
  /** Media path of the show cover (square JPG, 1400–3000 px). */
  cover: z.string().optional(),
  episodes: z.array(PodcastEpisodeSchema),
});
export type PodcastManifest = z.infer<typeof PodcastManifestSchema>;

export function podcastFolder(show: PodcastShowId): string {
  return `podcast/${show}`;
}

export function podcastManifestPath(show: PodcastShowId): string {
  return `${podcastFolder(show)}/episodes.json`;
}

/** Adds or replaces the episode of the same book (keeping its guid), newest publish time first. */
export function upsertEpisode(manifest: PodcastManifest, episode: PodcastEpisode): PodcastManifest {
  const previous = manifest.episodes.find((e) => e.bookId === episode.bookId);
  const merged = previous ? { ...episode, guid: previous.guid } : episode;
  const episodes = [...manifest.episodes.filter((e) => e.bookId !== episode.bookId), merged];
  episodes.sort((a, b) => b.publishAt.localeCompare(a.publishAt));
  return { ...manifest, episodes };
}

/** The episodes that are live at `now`, newest first. */
export function liveEpisodes(manifest: PodcastManifest, now: Date): PodcastEpisode[] {
  return manifest.episodes
    .filter((e) => {
      const at = Date.parse(e.publishAt);
      return Number.isFinite(at) && at <= now.getTime();
    })
    .sort((a, b) => b.publishAt.localeCompare(a.publishAt));
}

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "HH:MM:SS" for itunes:duration. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export interface FeedInput {
  show: PodcastShowId;
  manifest: PodcastManifest;
  /** Public origin, no trailing slash. */
  site: string;
  /** Turns a media path into an absolute URL. */
  mediaUrl: (path: string) => string;
  now: Date;
  /** Contact address for the podcast directories (itunes:owner). Optional. */
  ownerEmail?: string;
}

/** RSS 2.0 with the iTunes and Podcasting 2.0 tags that Spotify and Apple read. */
export function buildPodcastFeed({ show, manifest, site, mediaUrl, now, ownerEmail }: FeedInput): string {
  const meta = PODCAST_SHOWS[show];
  const feedUrl = `${site}/podcast/${show}/feed.xml`;
  const link = `${site}/?utm_source=podcast&utm_medium=audio&utm_campaign=${show}`;
  const episodes = liveEpisodes(manifest, now);
  const cover = manifest.cover ? mediaUrl(manifest.cover) : undefined;

  const items = episodes.map((e) => {
    const bookUrl = `${site}/book/${encodeURIComponent(e.slug)}?utm_source=podcast&utm_medium=audio&utm_campaign=${show}`;
    const description = `${e.description}\n\nלקריאת הסיפור עם ניקוד ואיורים: ${bookUrl}`;
    return [
      "    <item>",
      `      <title>${xml(e.title)}</title>`,
      `      <description>${xml(description)}</description>`,
      `      <link>${xml(bookUrl)}</link>`,
      `      <guid isPermaLink="false">${xml(e.guid)}</guid>`,
      `      <pubDate>${new Date(e.publishAt).toUTCString()}</pubDate>`,
      `      <enclosure url="${xml(mediaUrl(e.audio))}" length="${e.bytes}" type="audio/mpeg"/>`,
      `      <itunes:duration>${formatDuration(e.durationSeconds)}</itunes:duration>`,
      "      <itunes:explicit>false</itunes:explicit>",
      "      <itunes:episodeType>full</itunes:episodeType>",
      e.image ? `      <itunes:image href="${xml(mediaUrl(e.image))}"/>` : "",
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">',
    "  <channel>",
    `    <title>${xml(meta.title)}</title>`,
    `    <link>${xml(link)}</link>`,
    `    <atom:link href="${xml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    "    <language>he</language>",
    `    <description>${xml(meta.description)}</description>`,
    `    <itunes:subtitle>${xml(meta.subtitle)}</itunes:subtitle>`,
    `    <itunes:summary>${xml(meta.description)}</itunes:summary>`,
    "    <itunes:author>הסיפור שלי</itunes:author>",
    ownerEmail
      ? `    <itunes:owner><itunes:name>הסיפור שלי</itunes:name><itunes:email>${xml(ownerEmail)}</itunes:email></itunes:owner>`
      : "",
    cover ? `    <itunes:image href="${xml(cover)}"/>` : "",
    cover ? `    <image><url>${xml(cover)}</url><title>${xml(meta.title)}</title><link>${xml(link)}</link></image>` : "",
    `    <itunes:category text="${xml(meta.category)}"><itunes:category text="${xml(meta.subcategory)}"/></itunes:category>`,
    "    <itunes:explicit>false</itunes:explicit>",
    "    <itunes:type>episodic</itunes:type>",
    "    <podcast:locked>no</podcast:locked>",
    episodes[0] ? `    <lastBuildDate>${new Date(episodes[0].publishAt).toUTCString()}</lastBuildDate>` : "",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
