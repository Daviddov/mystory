/**
 * GET /podcast/<show>/feed.xml   the RSS feed of a podcast show (see src/lib/podcast.ts)
 *
 * Submit this URL once to Spotify for Creators, Apple Podcasts Connect,
 * YouTube Music and Amazon Music; new episodes then appear there by themselves.
 * Episodes are uploaded by scripts/export-media.ts (--publish); an episode
 * queued for a later time joins the feed when that time passes.
 */
import { siteUrl } from "@/lib/config";
import { getMediaStore, mediaUrl } from "@/lib/media";
import {
  buildPodcastFeed,
  isPodcastShow,
  PodcastManifestSchema,
  podcastManifestPath,
  type PodcastManifest,
} from "@/lib/podcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ show: string }> }): Promise<Response> {
  const { show } = await context.params;
  if (!isPodcastShow(show)) return new Response("Not found", { status: 404 });

  const store = await getMediaStore();
  const file = await store.get(podcastManifestPath(show));
  let manifest: PodcastManifest = { episodes: [] };
  if (file) {
    const parsed = PodcastManifestSchema.safeParse(JSON.parse(new TextDecoder().decode(file.bytes)));
    if (!parsed.success) {
      console.error(`[podcast] invalid manifest for ${show}`, parsed.error.issues);
      return new Response("Feed unavailable", { status: 500 });
    }
    manifest = parsed.data;
  }

  const site = siteUrl();
  const body = buildPodcastFeed({
    show,
    manifest,
    site,
    mediaUrl: (path) => site + mediaUrl(path),
    now: new Date(),
    ownerEmail: process.env.PODCAST_OWNER_EMAIL?.trim() || undefined,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Podcast apps poll often; a CDN copy for ten minutes is plenty fresh.
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
