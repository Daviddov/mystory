import { afterEach, describe, expect, it, vi } from "vitest";
import { mockVideoProvider } from "../mock";
import { ProviderNotImplementedError, VideoRefusedError, type VideoRequest } from "../types";
import {
  VEO_BASE_URL,
  VEO_DEFAULT_MODEL,
  VideoProviderError,
  buildVeoPrompt,
  buildVeoRequest,
  createGeminiVideoProvider,
  createVideoProvider,
  parseVeoOperation,
  roundVeoDuration,
  veoClipSeconds,
  veoCostUsd,
} from "./video";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const request: VideoRequest = { image: PNG, imageContentType: "image/png", prompt: "the leaves sway" };
const OP = "models/veo-3.1-lite-generate-preview/operations/abc123";
const VIDEO_URI = "https://generativelanguage.googleapis.com/v1beta/files/xyz:download?alt=media";
const doneBody = {
  name: OP,
  done: true,
  response: { generateVideoResponse: { generatedSamples: [{ video: { uri: VIDEO_URI } }] } },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function mp4(): Response {
  return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
    status: 200,
    headers: { "content-type": "video/mp4" },
  });
}

/** Stubs global fetch with a queue of responses (or functions producing them). */
function stubFetch(...responses: (Response | Error | (() => Response))[]) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pure helpers", () => {
  it("rounds durations to 4/6/8, ties to the shorter clip", () => {
    expect(roundVeoDuration(undefined)).toBe(4);
    expect(roundVeoDuration(Number.NaN)).toBe(4);
    expect(roundVeoDuration(1)).toBe(4);
    expect(roundVeoDuration(5)).toBe(4);
    expect(roundVeoDuration(5.1)).toBe(6);
    expect(roundVeoDuration(7)).toBe(6);
    expect(roundVeoDuration(7.5)).toBe(8);
    expect(roundVeoDuration(30)).toBe(8);
  });

  it("wraps the prompt with gentle-motion guidance", () => {
    const prompt = buildVeoPrompt("the girl blinks");
    expect(prompt).toContain("the girl blinks");
    expect(prompt).toMatch(/subtle/);
    expect(prompt).toMatch(/no camera cuts/i);
    expect(prompt).toMatch(/No text/);
    expect(buildVeoPrompt("  ")).toMatch(/Motion: Gentle ambient motion/);
  });

  it("builds the predictLongRunning body", () => {
    const body = buildVeoRequest({ ...request, durationSeconds: 7.9, aspect: "9:16" }) as {
      instances: { prompt: string; image: { bytesBase64Encoded: string; mimeType: string } }[];
      parameters: Record<string, unknown>;
    };
    expect(body.instances).toHaveLength(1);
    expect(body.instances[0].prompt).toContain("the leaves sway");
    expect(body.instances[0].image).toEqual({
      bytesBase64Encoded: Buffer.from(PNG).toString("base64"),
      mimeType: "image/png",
    });
    expect((body.instances[0] as { lastFrame?: unknown }).lastFrame).toEqual(body.instances[0].image);
    expect((buildVeoRequest({ ...request, loop: false }) as { instances: { lastFrame?: unknown }[] }).instances[0].lastFrame).toBeUndefined();
    expect(body.parameters).toEqual({
      aspectRatio: "9:16",
      durationSeconds: 8,
      resolution: "720p",
      personGeneration: "allow_adult",
    });
    expect((buildVeoRequest(request) as { parameters: { aspectRatio: string } }).parameters.aspectRatio).toBe("16:9");
  });

  it("parses operation states", () => {
    expect(parseVeoOperation({ name: OP })).toEqual({ kind: "pending" });
    expect(parseVeoOperation({ name: OP, done: false })).toEqual({ kind: "pending" });
    expect(parseVeoOperation(doneBody)).toEqual({ kind: "done", uri: VIDEO_URI });
    expect(
      parseVeoOperation({ done: true, response: { generatedVideos: [{ video: { uri: "https://x/v" } }] } }),
    ).toEqual({ kind: "done", uri: "https://x/v" });
    expect(
      parseVeoOperation({
        done: true,
        response: { generateVideoResponse: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ["child safety"] } },
      }),
    ).toEqual({ kind: "refused", reason: "child safety" });
    expect(parseVeoOperation({ done: true, error: { code: 3, message: "Blocked by safety policy" } }).kind).toBe(
      "refused",
    );
    expect(parseVeoOperation({ done: true, error: { code: 13, message: "Internal error" } })).toEqual({
      kind: "error",
      message: "Internal error",
    });
    expect(parseVeoOperation({ done: true, response: {} }).kind).toBe("error");
  });

  it("makes looping clips 8 seconds long (Veo requires it with lastFrame)", () => {
    expect(veoClipSeconds({ durationSeconds: 4 })).toBe(8);
    expect(veoClipSeconds({ durationSeconds: 4, loop: false })).toBe(4);
  });

  it("estimates cost per model at 720p", () => {
    expect(veoCostUsd("veo-3.1-lite-generate-preview", 4)).toBe(0.2);
    expect(veoCostUsd("veo-3.1-fast-generate-preview", 6)).toBe(0.6);
    expect(veoCostUsd("veo-3.1-generate-preview", 8)).toBe(3.2);
    expect(veoCostUsd("unknown", 8)).toBeUndefined();
  });
});

describe("gemini video provider", () => {
  const provider = () => createGeminiVideoProvider("KEY", VEO_DEFAULT_MODEL, { pollIntervalMs: 1 });

  it("starts, polls, downloads and reports cost", async () => {
    const fetchMock = stubFetch(json({ name: OP }), json({ name: OP, done: false }), json(doneBody), mp4());
    const result = await provider().animate({ ...request, durationSeconds: 6, loop: false });

    expect(result.isMock).toBe(false);
    expect(result.contentType).toBe("video/mp4");
    expect(result.durationSeconds).toBe(6);
    expect(result.video.byteLength).toBe(8);
    expect(result.usage?.costUsd).toBe(0.3);

    const calls = fetchMock.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0][0]).toBe(`${VEO_BASE_URL}/models/${VEO_DEFAULT_MODEL}:predictLongRunning`);
    expect(calls[0][1]?.method).toBe("POST");
    expect((calls[0][1]?.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    expect(JSON.parse(String(calls[0][1]?.body)).parameters.durationSeconds).toBe(6);
    expect(calls[1][0]).toBe(`${VEO_BASE_URL}/${OP}`);
    expect(calls[3][0]).toBe(VIDEO_URI);
    expect((calls[3][1]?.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
  });

  it("maps a filtered result to VideoRefusedError", async () => {
    stubFetch(
      json({ name: OP }),
      json({ name: OP, done: true, response: { generateVideoResponse: { raiMediaFilteredCount: 1 } } }),
    );
    await expect(provider().animate(request)).rejects.toBeInstanceOf(VideoRefusedError);
  });

  it("maps a 400 policy rejection on start to VideoRefusedError", async () => {
    stubFetch(json({ error: { code: 400, message: "The prompt violates our usage policies." } }, 400));
    await expect(provider().animate(request)).rejects.toBeInstanceOf(VideoRefusedError);
  });

  it("other HTTP errors are normal errors", async () => {
    stubFetch(json({ error: { code: 403, message: "API key not valid" } }, 403));
    const err = await provider().animate(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VideoProviderError);
    expect(err).not.toBeInstanceOf(VideoRefusedError);
  });

  it("network errors are normal errors, and a few failed polls are retried", async () => {
    stubFetch(new TypeError("fetch failed"));
    await expect(provider().animate(request)).rejects.toBeInstanceOf(VideoProviderError);

    stubFetch(json({ name: OP }), new TypeError("fetch failed"), json({}, 503), json(doneBody), mp4());
    await expect(provider().animate(request)).resolves.toMatchObject({ isMock: false });
  });

  it("rejects unsupported first-frame types before calling the API", async () => {
    const fetchMock = stubFetch();
    await expect(provider().animate({ ...request, imageContentType: "image/svg+xml" })).rejects.toBeInstanceOf(
      VideoProviderError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out with a clear error", async () => {
    stubFetch(json({ name: OP }), () => json({ name: OP, done: false }), () => json({ name: OP, done: false }));
    const slow = createGeminiVideoProvider("KEY", VEO_DEFAULT_MODEL, { pollIntervalMs: 30, timeoutMs: 50 });
    await expect(slow.animate(request)).rejects.toThrow(/did not finish/);
  });

  it("honors the caller's AbortSignal", async () => {
    const controller = new AbortController();
    stubFetch(json({ name: OP }), json({ name: OP, done: false }));
    const slow = createGeminiVideoProvider("KEY", VEO_DEFAULT_MODEL, { pollIntervalMs: 60_000 });
    const pending = slow.animate(request, controller.signal);
    setTimeout(() => controller.abort(new Error("stop")), 10);
    await expect(pending).rejects.toThrow("stop");

    const aborted = new AbortController();
    aborted.abort();
    await expect(slow.animate(request, aborted.signal)).rejects.toBeDefined();
  });
});

describe("createVideoProvider", () => {
  it("fails loudly on an unknown vendor", () => {
    vi.stubEnv("VIDEO_PROVIDER", "runway");
    expect(() => createVideoProvider()).toThrow(ProviderNotImplementedError);
  });

  it("requires a key and falls back to IMAGE_API_KEY", () => {
    vi.stubEnv("VIDEO_PROVIDER", "gemini");
    vi.stubEnv("VIDEO_API_KEY", "");
    vi.stubEnv("IMAGE_API_KEY", "");
    expect(() => createVideoProvider()).toThrow(/VIDEO_API_KEY/);
    vi.stubEnv("IMAGE_API_KEY", "img-key");
    expect(createVideoProvider().name).toBe("gemini");
  });
});

describe("mock video provider", () => {
  it("returns a small real MP4", async () => {
    const result = await mockVideoProvider.animate(request);
    expect(result.isMock).toBe(true);
    expect(result.contentType).toBe("video/mp4");
    expect(result.durationSeconds).toBeGreaterThan(0);
    // ISO BMFF: bytes 4..8 are the "ftyp" box type.
    expect(new TextDecoder().decode(result.video.slice(4, 8))).toBe("ftyp");
    expect(result.video.byteLength).toBeLessThan(4096);
  });
});
