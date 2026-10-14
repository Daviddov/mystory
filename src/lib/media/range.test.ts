import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as mediaGet, HEAD as mediaHead } from "@/app/media/[...path]/route";
import { createTempData, type TempData } from "@/test/temp-data";
import { parseByteRange } from "./range";

describe("parseByteRange", () => {
  it("reads closed, open and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange(" bytes=1-2 ", 10)).toEqual({ start: 1, end: 2 });
  });

  it("answers Safari's two-byte probe", () => {
    expect(parseByteRange("bytes=0-1", 1000)).toEqual({ start: 0, end: 1 });
  });

  it("clamps an end past the file and a suffix longer than the file", () => {
    expect(parseByteRange("bytes=10-5000", 100)).toEqual({ start: 10, end: 99 });
    expect(parseByteRange("bytes=-5000", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects ranges that cannot be satisfied", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
    expect(parseByteRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseByteRange("bytes=-", 100)).toBe("invalid");
    expect(parseByteRange("bytes=-0", 100)).toBe("invalid");
    expect(parseByteRange("bytes=-10", 0)).toBe("invalid");
  });

  it("ignores forms it does not support, so the whole file is sent", () => {
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
    expect(parseByteRange("garbage", 100)).toBeNull();
  });
});

describe("/media route: video clips", () => {
  let data: TempData;
  // A fake clip: the route only cares about bytes and the extension.
  const clip = new Uint8Array(Array.from({ length: 64 }, (_, i) => i));

  beforeEach(async () => {
    data = await createTempData({ setEnv: true });
    await data.repo.createBook({ id: "bk_v", title: "ספר", ownerId: "u_owner", status: "published" });
    await data.media.put("books/bk_v/page-1.mp4", clip, "video/mp4");
  });

  afterEach(async () => {
    await data.cleanup();
  });

  const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/media/books/bk_v/page-1.mp4", { headers });
  const params = { params: Promise.resolve({ path: ["books", "bk_v", "page-1.mp4"] }) };

  it("serves an mp4 whole, as video/mp4, and advertises ranges", async () => {
    const response = await mediaGet(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("64");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(clip);
  });

  it("answers a range request with 206 Partial Content", async () => {
    const probe = await mediaGet(request({ range: "bytes=0-1" }), params);
    expect(probe.status).toBe(206);
    expect(probe.headers.get("content-type")).toBe("video/mp4");
    expect(probe.headers.get("content-range")).toBe("bytes 0-1/64");
    expect(probe.headers.get("content-length")).toBe("2");
    expect(Array.from(new Uint8Array(await probe.arrayBuffer()))).toEqual([0, 1]);

    const tail = await mediaGet(request({ range: "bytes=60-" }), params);
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe("bytes 60-63/64");
    expect(Array.from(new Uint8Array(await tail.arrayBuffer()))).toEqual([60, 61, 62, 63]);
  });

  it("answers 416 for a range past the end, with the size", async () => {
    const response = await mediaGet(request({ range: "bytes=64-" }), params);
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */64");
  });

  it("answers a HEAD range request without a body", async () => {
    const response = await mediaHead(request({ range: "bytes=0-9" }), params);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.body).toBeNull();
  });
});
