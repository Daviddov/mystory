import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import {
  bookMediaPath,
  contentTypeForPath,
  extensionForContentType,
  InvalidMediaPathError,
  isValidMediaPath,
  mediaUrl,
  safeFileName,
} from "./url";

let data: TempData;

beforeEach(async () => {
  data = await createTempData();
});

afterEach(async () => {
  await data.cleanup();
});

describe("media paths", () => {
  it("accepts simple relative paths", () => {
    expect(isValidMediaPath("books/bk_1/page-01.svg")).toBe(true);
    expect(bookMediaPath("bk_1", "cover.png")).toBe("books/bk_1/cover.png");
  });

  it.each([
    "",
    "/etc/passwd",
    "../secret",
    "books/../../secret",
    "books/..",
    "books//x.png",
    "books\\x.png",
    "books/.hidden",
    "C:/windows/x",
    "books/x.png\u0000",
    "books/%2e%2e/x",
    "books/שלום.png",
  ])("rejects %j", (path) => {
    expect(isValidMediaPath(path)).toBe(false);
  });

  it("builds URLs and maps content types", () => {
    expect(mediaUrl("books/b/p.svg")).toBe("/media/books/b/p.svg");
    expect(mediaUrl("books/b/p.svg", "v 1")).toBe("/media/books/b/p.svg?v=v%201");
    expect(mediaUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(mediaUrl(undefined)).toBe("");
    expect(contentTypeForPath("a/b.SVG")).toBe("image/svg+xml");
    expect(contentTypeForPath("a/b.unknown")).toBe("application/octet-stream");
    expect(extensionForContentType("audio/webm;codecs=opus")).toBe("webm");
    // Animated illustrations are mp4 clips.
    expect(contentTypeForPath("books/b1/page-1.mp4")).toBe("video/mp4");
    expect(contentTypeForPath("books/b1/page-1.M4V")).toBe("video/mp4");
    expect(extensionForContentType("video/mp4")).toBe("mp4");
    expect(extensionForContentType("video/webm")).toBe("webm");
    // WebM keeps its audio type: family recordings are WebM and stay in the audio bucket.
    expect(contentTypeForPath("books/b1/rec/r1/p1.webm")).toBe("audio/webm");
    expect(safeFileName("../תמונה של ילד.PNG")).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/);
  });
});

describe("LocalMediaStore", () => {
  it("stores, reads, lists and deletes files", async () => {
    const bytes = new TextEncoder().encode("<svg/>");
    const put = await data.media.put("books/b1/cover.svg", bytes, "image/svg+xml");
    expect(put).toEqual({ path: "books/b1/cover.svg", url: "/media/books/b1/cover.svg" });
    await data.media.put("books/b1/audio/p1.wav", new Uint8Array([1, 2, 3]), "audio/wav");

    const got = await data.media.get("books/b1/cover.svg");
    expect(got?.contentType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(got?.bytes)).toBe("<svg/>");
    expect(await data.media.list("books/b1")).toEqual(["books/b1/audio/p1.wav", "books/b1/cover.svg"]);

    await data.media.delete("books/b1/cover.svg");
    expect(await data.media.get("books/b1/cover.svg")).toBeNull();
    await data.media.deletePrefix("books/b1");
    expect(await data.media.list("books/b1")).toEqual([]);
    expect(await data.media.get("books/missing/x.png")).toBeNull();
  });

  it("refuses to leave the media folder", async () => {
    await expect(data.media.get("../books.json")).rejects.toBeInstanceOf(InvalidMediaPathError);
    await expect(data.media.put("a/../../x.txt", new Uint8Array(), "text/plain")).rejects.toBeInstanceOf(
      InvalidMediaPathError,
    );
    expect(() => data.media.resolve("..")).toThrow(InvalidMediaPathError);
  });
});
