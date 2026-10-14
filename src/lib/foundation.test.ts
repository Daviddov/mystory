import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mockImageProvider, mockNikudProvider, mockTextProvider, mockTtsProvider } from "./ai/mock";
import { GeneratedStorySchema } from "./ai/types";
import { createSessionToken, verifySessionToken } from "./auth/session";
import { countWords, hasNikud, normalizeForSearch, slugify, splitWords, stripNikud } from "./hebrew";
import { routes } from "./routes";
import { CATEGORIES, readingTimeBucket, tagFromSlug, tagSlug } from "./taxonomy";

describe("hebrew helpers", () => {
  it("strips nikud and normalizes for search", () => {
    expect(stripNikud("שַׁבְּלוּל קָטָן")).toBe("שבלול קטן");
    expect(hasNikud("שַׁבְּלוּל")).toBe(true);
    expect(hasNikud("שבלול")).toBe(false);
    expect(normalizeForSearch("  שָׁלוֹם,  עוֹלָם! ")).toBe("שלום עולם");
  });

  it("splits words and builds slugs", () => {
    expect(splitWords("  מי  מתחבא\nבגינה? ")).toEqual(["מי", "מתחבא", "בגינה?"]);
    expect(countWords("")).toBe(0);
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("שלום עולם")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slugify("!!!")).toBe("");
  });
});

describe("taxonomy and routes", () => {
  it("has the twelve categories and stable buckets", () => {
    expect(CATEGORIES).toHaveLength(15);
    expect([1, 5, 6, 10, 11, 15, 16, 40].map(readingTimeBucket)).toEqual(["5", "5", "10", "10", "15", "15", "20", "20"]);
  });

  it("round-trips tags through URLs", () => {
    expect(tagSlug(" גן  ילדים ")).toBe("גן-ילדים");
    expect(tagFromSlug(encodeURIComponent("גן-ילדים"))).toBe("גן ילדים");
    expect(decodeURIComponent(routes.tag("גן ילדים"))).toBe("/tag/גן-ילדים");
    expect(routes.read("my-book", 3)).toBe("/read/my-book?page=3");
    expect(routes.login("/studio")).toBe("/login?next=%2Fstudio");
  });
});

describe("session tokens", () => {
  it("verifies a valid token and rejects tampering, wrong secrets and expiry", () => {
    const now = Date.UTC(2026, 0, 1);
    const token = createSessionToken("u_1", "secret", 60, now);
    expect(verifySessionToken(token, "secret", now)?.uid).toBe("u_1");
    expect(verifySessionToken(token, "other", now)).toBeNull();
    expect(verifySessionToken(token, "secret", now + 61_000)).toBeNull();
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: 9_999_999_999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${signature}`, "secret", now)).toBeNull();
    expect(verifySessionToken(`${body}.`, "secret", now)).toBeNull();
    expect(verifySessionToken("garbage", "secret", now)).toBeNull();
    expect(verifySessionToken(undefined, "secret", now)).toBeNull();
  });
});

describe("mock AI providers", () => {
  it("text: returns the fixed story or the supplied mockData, always flagged", async () => {
    const story = await mockTextProvider.generate({ prompt: "x", schema: GeneratedStorySchema });
    expect(story.isMock).toBe(true);
    expect(story.data.pages.length).toBeGreaterThan(0);

    const schema = z.object({ ok: z.boolean() });
    expect((await mockTextProvider.generate({ prompt: "x", schema, mockData: { ok: true } })).data).toEqual({ ok: true });
    await expect(mockTextProvider.generate({ prompt: "x", schema })).rejects.toThrow(/mockData/);
  });

  it("nikud: returns the text unchanged and flagged", async () => {
    expect(await mockNikudProvider.addNikud("שלום עולם")).toEqual({ text: "שלום עולם", isMock: true });
  });

  it("tts: returns a valid silent WAV with one timing per word", async () => {
    const text = "לילה טוב, ירח עגול.";
    const result = await mockTtsProvider.synthesize(text);
    expect(result.isMock).toBe(true);
    expect(result.contentType).toBe("audio/wav");
    expect(result.wordTimings.map((t) => t.word)).toEqual(splitWords(text));
    expect(result.wordTimings[1].start).toBeCloseTo(result.wordTimings[0].end);
    expect(result.durationSeconds).toBeCloseTo(result.wordTimings.at(-1)!.end);

    const view = new DataView(result.audio.buffer, result.audio.byteOffset, result.audio.byteLength);
    const tag = (offset: number) => String.fromCharCode(...result.audio.slice(offset, offset + 4));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(36)).toBe("data");
    expect(view.getUint32(4, true)).toBe(result.audio.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(result.audio.byteLength - 44);
    expect(view.getUint32(24, true) * result.durationSeconds).toBeCloseTo(result.audio.byteLength - 44, -1);
  });

  it("image: returns a labelled SVG placeholder with the escaped caption", async () => {
    const result = await mockImageProvider.generate({ prompt: "a cat", caption: "חתול <קטן>", style: "watercolor" });
    const svg = new TextDecoder().decode(result.image);
    expect(result).toMatchObject({ isMock: true, contentType: "image/svg+xml" });
    expect(svg).toContain("איור לדוגמה");
    expect(svg).toContain("חתול");
    expect(svg).not.toContain("<קטן>");
  });
});
