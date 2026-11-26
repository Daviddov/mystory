/**
 * The /media route with a remote (Supabase-like) store: a published book's
 * pictures are served from the site's own address, cached by the CDN, so
 * search engines can keep them; audio and private files still redirect to an
 * expiring signed URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { User } from "../types";

vi.mock("@/lib/auth/local", () => ({
  createLocalAuth: () => ({ kind: "local", getCurrentUser: async () => null as User | null, signOut: async () => {} }),
  isLocalLoginAllowed: () => true,
  signInLocal: async () => {
    throw new Error("not used in tests");
  },
}));

import { GET as mediaGet } from "@/app/media/[...path]/route";
import { dataDir } from "../config";
import type { MediaStore } from "./types";

const WEBP = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
let data: TempData;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  const local = data.media;
  const remote: MediaStore = Object.assign(Object.create(Object.getPrototypeOf(local)) as MediaStore, local, {
    kind: "supabase" as const,
    signedUrl: async (path: string) => `https://storage.example/${path}?token=expiring`,
  });
  (globalThis as unknown as { __mystoryMedia?: unknown }).__mystoryMedia = {
    key: `local:${dataDir()}`,
    store: Promise.resolve(remote),
  };
});
afterEach(async () => {
  (globalThis as unknown as { __mystoryMedia?: unknown }).__mystoryMedia = undefined;
  await data.cleanup();
});

function get(mediaPath: string, query = "") {
  return mediaGet(new Request(`http://localhost/media/${mediaPath}${query}`), {
    params: Promise.resolve({ path: mediaPath.split("/") }),
  });
}

describe("GET /media with a remote store", () => {
  it("serves a published book's picture from its own address, cached by the CDN", async () => {
    await data.repo.createBook({ id: "bk_pub", title: "ספר", ownerId: "u1", status: "published", coverImage: "books/bk_pub/cover.webp" });
    await data.media.put("books/bk_pub/cover.webp", WEBP, "image/webp");
    await data.media.put("books/bk_pub/page-01.mp3", WEBP, "audio/mpeg");

    const picture = await get("books/bk_pub/cover.webp", "?v=1");
    expect(picture.status).toBe(200);
    expect(picture.headers.get("location")).toBeNull();
    expect(picture.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(new Uint8Array(await picture.arrayBuffer())).toEqual(WEBP);

    const audio = await get("books/bk_pub/page-01.mp3");
    expect(audio.status).toBe(302);
    expect(audio.headers.get("location")).toContain("token=expiring");
  });

  it("still redirects a private book's picture, uncached", async () => {
    await data.repo.createBook({ id: "bk_priv", title: "ספר", ownerId: "u1", status: "private", shareToken: "abcdefghijklmnopqrstuvwx" });
    await data.media.put("books/bk_priv/cover.webp", WEBP, "image/webp");
    const response = await get("books/bk_priv/cover.webp", "?t=abcdefghijklmnopqrstuvwx");
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
