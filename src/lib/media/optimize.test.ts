import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import { LocalMediaStore } from "./local";
import { type ImageStore, prepareImage, putImage, storeImage, WEBP_MAX_SIDE, webpPath } from "./optimize";

/** Gradients with grain: compresses like an illustration, not like a flat color or a repeating pattern. */
async function picture(width: number, height: number, format: "png" | "jpeg", options: { alpha?: boolean; quality?: number } = {}) {
  const channels = options.alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 7;
  const grain = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed % 24) - 12;
  };
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < raw.length; i += channels) {
    const p = i / channels;
    const x = p % width;
    const y = Math.floor(p / width);
    raw[i] = clamp((x / width) * 255 + grain());
    raw[i + 1] = clamp((y / height) * 255 + grain());
    raw[i + 2] = clamp(128 + 100 * Math.sin((x + y) / 60) + grain());
    if (options.alpha) raw[i + 3] = x < width / 2 ? 0 : 255;
  }
  const image = sharp(raw, { raw: { width, height, channels } });
  const out = format === "png" ? await image.png().toBuffer() : await image.jpeg({ quality: options.quality ?? 95 }).toBuffer();
  return new Uint8Array(out);
}

let data: TempData;

beforeEach(async () => {
  data = await createTempData();
});

afterEach(async () => {
  await data.cleanup();
});

describe("webpPath", () => {
  it("swaps the extension of the last segment only", () => {
    expect(webpPath("books/bk_1/page-01.png")).toBe("books/bk_1/page-01.webp");
    expect(webpPath("books/bk.v2/cover.JPG")).toBe("books/bk.v2/cover.webp");
    expect(webpPath("books/bk.v2/cover")).toBe("books/bk.v2/cover.webp");
  });
});

// sharp work: generous timeouts for a busy machine.
describe("prepareImage", { timeout: 60_000 }, () => {
  it("turns a large PNG into a WebP of at most 1600 px on the long side", async () => {
    const png = await picture(2000, 1000, "png");
    const result = await prepareImage("books/bk_1/page-01.png", png, "image/png");

    expect(result.path).toBe("books/bk_1/page-01.webp");
    expect(result.contentType).toBe("image/webp");
    expect(result.bytes.byteLength).toBeLessThan(png.byteLength * 0.9);
    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([WEBP_MAX_SIDE, 800]);
    expect(result.original).toEqual({ path: "books/bk_1/page-01.png", bytes: png, contentType: "image/png" });
  });

  it("does not enlarge a small picture", async () => {
    const result = await prepareImage("a/b.png", await picture(400, 300, "png"), "image/png");
    const meta = await sharp(result.bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 400, 300]);
  });

  it("keeps transparency", async () => {
    const result = await prepareImage("a/b.png", await picture(600, 400, "png", { alpha: true }), "image/png");
    expect(result.contentType).toBe("image/webp");
    const meta = await sharp(result.bytes).metadata();
    expect(meta.hasAlpha).toBe(true);
    const { data: pixels } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(pixels[3]).toBe(0); // top-left pixel stays transparent
  });

  it("keeps the input when the WebP would not be at least 10% smaller", async () => {
    const jpeg = await picture(300, 200, "jpeg", { quality: 5 });
    const result = await prepareImage("a/b.jpg", jpeg, "image/jpeg");
    expect(result).toEqual({ path: "a/b.jpg", bytes: jpeg, contentType: "image/jpeg" });
  });

  it.each([
    ["image/gif", "a/b.gif"],
    ["image/svg+xml", "a/b.svg"],
    ["audio/mpeg", "a/b.mp3"],
  ])("leaves %s alone", async (contentType, file) => {
    const bytes = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect(await prepareImage(file, bytes, contentType)).toEqual({ path: file, bytes, contentType });
  });

  it("keeps bytes it cannot decode", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await prepareImage("a/b.png", bytes, "image/png")).toEqual({ path: "a/b.png", bytes, contentType: "image/png" });
  });
});

describe("storeImage", { timeout: 60_000 }, () => {
  it("stores the WebP and keeps the original under originals/media in the local store", async () => {
    const store = new LocalMediaStore(data.dir);
    const png = await picture(1000, 700, "png");
    const stored = await storeImage(store, "books/bk_1/page-01.png", png, "image/png");

    expect(stored.path).toBe("books/bk_1/page-01.webp");
    expect(stored.url).toBe("/media/books/bk_1/page-01.webp");
    expect(stored.contentType).toBe("image/webp");
    expect(await store.list("books/bk_1")).toEqual(["books/bk_1/page-01.webp"]);
    const served = await store.get(stored.path);
    expect(served?.contentType).toBe("image/webp");
    expect(served?.size).toBe(stored.size);
    const original = await readFile(path.join(data.dir, "originals", "media", "books", "bk_1", "page-01.png"));
    expect(new Uint8Array(original)).toEqual(png);
  });

  it("stores the input as it is when it is not converted, with no original", async () => {
    const store = new LocalMediaStore(data.dir);
    const gif = new TextEncoder().encode("GIF89a-not-really");
    const stored = await storeImage(store, "books/bk_1/anim.gif", gif, "image/gif");
    expect(stored).toMatchObject({ path: "books/bk_1/anim.gif", contentType: "image/gif", size: gif.byteLength });
    await expect(readFile(path.join(data.dir, "originals", "media", "books", "bk_1", "anim.gif"))).rejects.toThrow();
  });

  it("works with a store that keeps no originals, and survives a failing one", async () => {
    const put: string[] = [];
    const base: ImageStore = {
      put: async (p: string) => {
        put.push(p);
        return { path: p, url: `/media/${p}` };
      },
    };
    const image = await prepareImage("a/b.png", await picture(800, 600, "png"), "image/png");
    expect(await putImage(base, image)).toEqual({ path: "a/b.webp", url: "/media/a/b.webp" });

    const failing: ImageStore = { ...base, putOriginal: async () => Promise.reject(new Error("disk full")) };
    expect((await putImage(failing, image)).path).toBe("a/b.webp");
    expect(put).toEqual(["a/b.webp", "a/b.webp"]);
  });
});
