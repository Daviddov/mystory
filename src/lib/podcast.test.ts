import { describe, expect, it } from "vitest";
import { buildPodcastFeed, formatDuration, liveEpisodes, upsertEpisode, type PodcastEpisode } from "./podcast";

function episode(over: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    bookId: "bk1",
    slug: "hatzav-vehaarnav",
    title: "הצב והארנב",
    description: "מי ינצח במרוץ? <מפתיע> & מצחיק",
    audio: "podcast/bedtime/hatzav-vehaarnav.mp3",
    bytes: 1234,
    durationSeconds: 185.4,
    publishAt: "2026-11-01T17:00:00.000Z",
    guid: "mystory-bedtime-bk1",
    ...over,
  };
}

describe("podcast", () => {
  it("formats durations", () => {
    expect(formatDuration(185.4)).toBe("00:03:05");
    expect(formatDuration(3725)).toBe("01:02:05");
  });

  it("keeps the guid of an episode that is replaced", () => {
    const first = upsertEpisode({ episodes: [] }, episode());
    const again = upsertEpisode(first, episode({ guid: "new", bytes: 99 }));
    expect(again.episodes).toHaveLength(1);
    expect(again.episodes[0]).toMatchObject({ guid: "mystory-bedtime-bk1", bytes: 99 });
  });

  it("leaves future episodes out", () => {
    const manifest = {
      episodes: [episode(), episode({ bookId: "bk2", publishAt: "2026-12-01T17:00:00.000Z", guid: "g2" })],
    };
    expect(liveEpisodes(manifest, new Date("2026-11-14T00:00:00Z")).map((e) => e.bookId)).toEqual(["bk1"]);
  });

  it("builds an escaped RSS feed with enclosures", () => {
    const xml = buildPodcastFeed({
      show: "bedtime",
      manifest: { cover: "podcast/bedtime/cover.jpg", episodes: [episode()] },
      site: "https://example.org",
      mediaUrl: (p) => `https://example.org/media/${p}`,
      now: new Date("2026-11-14T00:00:00Z"),
      ownerEmail: "owner@example.org",
    });
    expect(xml).toContain('<enclosure url="https://example.org/media/podcast/bedtime/hatzav-vehaarnav.mp3" length="1234" type="audio/mpeg"/>');
    expect(xml).toContain("&lt;מפתיע&gt; &amp; מצחיק");
    expect(xml).toContain("<itunes:duration>00:03:05</itunes:duration>");
    expect(xml).toContain('<itunes:image href="https://example.org/media/podcast/bedtime/cover.jpg"/>');
    expect(xml).toContain("https://example.org/book/hatzav-vehaarnav?utm_source=podcast");
    expect(xml).toContain("<itunes:email>owner@example.org</itunes:email>");
  });
});
