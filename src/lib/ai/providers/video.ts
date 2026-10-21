/**
 * Video provider ("bring the illustration to life"). Selected by
 * src/lib/ai/index.ts when VIDEO_PROVIDER is set to something other than "mock".
 *
 * Implemented vendor: VIDEO_PROVIDER=gemini (Google Veo through the Gemini
 * API), with VIDEO_API_KEY (no fallback) and optional
 * VIDEO_MODEL (default veo-3.1-lite-generate-preview). Any other value fails
 * loudly instead of returning the placeholder clip.
 *
 * Verified against Google's documentation on 2026-10-14:
 *   https://ai.google.dev/gemini-api/docs/veo
 *   https://ai.google.dev/api/models  (models.predictLongRunning)
 *   https://ai.google.dev/gemini-api/docs/pricing
 * What the docs state: POST {base}/models/{model}:predictLongRunning with
 * header `x-goog-api-key`; body `instances[0].prompt`, `instances[0].image`
 * = {bytesBase64Encoded,mimeType} (the first frame; the live API answered
 * HTTP 400 "`inlineData` isn't supported by this model" on 2026-10-15), `parameters` with
 * aspectRatio ("16:9"|"9:16"), durationSeconds (4|6|8), resolution ("720p"
 * default), personGeneration ("allow_adult" is the only value for
 * image-to-video). The response is an Operation whose top-level `name` is
 * polled with GET {base}/{name} until `done` is true; the clip is at
 * `response.generateVideoResponse.generatedSamples[0].video.uri` and is
 * downloaded with the same API key, following redirects. Videos are kept for
 * 2 days only, so we download immediately. Latency 11 s to 6 min. Audio is
 * always generated; we ignore it (the reader plays muted). Prices per second
 * at 720p: lite $0.05, fast $0.10, standard $0.40; billed only on success.
 *
 * Assumed, NOT in those pages:
 *  - durationSeconds is sent as a JSON number (the docs table writes "4"/"6"/"8";
 *    Google's own SDKs send a number and the field is a protobuf Value).
 *  - Safety refusals: the docs only say violating prompts are "blocked". We
 *    treat `generateVideoResponse.raiMediaFilteredCount > 0` /
 *    `raiMediaFilteredReasons[]` with no samples, and HTTP/operation errors
 *    whose message mentions safety/policy/responsible AI, as VideoRefusedError.
 *  - The SDK-style `generatedVideos[0].video.uri` path is accepted as a fallback.
 *
 * NOT exercised against the live API (no key was available when this was
 * written).
 *
 * No "server-only" import, so CLI scripts can use this file. It reads the API
 * key and must never be imported from client code.
 */
import { aiEnv } from "../../config";
import {
  ProviderNotImplementedError,
  VideoQuotaError,
  VideoRefusedError,
  type VideoProvider,
  type VideoRequest,
  type VideoResult,
} from "../types";

export const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const VEO_DEFAULT_MODEL = "veo-3.1-lite-generate-preview";
/** USD per second of output at 720p (the only resolution we request). */
export const VEO_PRICE_PER_SECOND_720P: Readonly<Record<string, number>> = {
  "veo-3.1-lite-generate-preview": 0.05,
  "veo-3.1-fast-generate-preview": 0.1,
  "veo-3.1-generate-preview": 0.4,
};
export const VEO_DURATIONS = [4, 6, 8] as const;
export type VeoDuration = (typeof VEO_DURATIONS)[number];

const POLL_INTERVAL_MS = 10_000;
const TOTAL_TIMEOUT_MS = 8 * 60_000;
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Consecutive failed polls (network error or HTTP 5xx/429) tolerated before giving up. */
const MAX_POLL_FAILURES = 3;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const POLICY_PATTERN = /safety|polic(y|ies)|responsible ai|\brai\b|blocked|filtered|prohibited|guideline|sensitive/i;

export class VideoProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoProviderError";
  }
}

// --- Pure helpers (exported for tests) ---------------------------------------------

/** Nearest supported Veo length; ties go to the shorter (cheaper) clip. Default 4. */
export function roundVeoDuration(seconds: number | undefined): VeoDuration {
  if (seconds === undefined || !Number.isFinite(seconds)) return 4;
  let best: VeoDuration = VEO_DURATIONS[0];
  for (const candidate of VEO_DURATIONS) {
    if (Math.abs(candidate - seconds) < Math.abs(best - seconds)) best = candidate;
  }
  return best;
}

/** Wraps the caller's motion description with the house rules for gentle picture-book animation. */
export function buildVeoPrompt(prompt: string): string {
  const motion = prompt.trim() || "Gentle ambient motion: a soft breeze, small natural movements.";
  return [
    "Bring this children's picture book illustration gently to life.",
    `Motion: ${motion}`,
    "Keep the motion subtle, slow and calm, suitable for a short seamless loop.",
    "Preserve the exact illustration style, colours, line work and composition of the image.",
    "Keep every character exactly as drawn: same faces, proportions, clothes and colours; no new characters or objects.",
    "Static or barely moving camera, no camera cuts, no zoom, no scene changes.",
    "No text, letters, captions, logos or watermarks.",
  ].join(" ");
}

/**
 * The clip length actually requested. A looping clip (lastFrame) must be 8 s:
 * the live API answers HTTP 400 "Your use case is currently not supported" for
 * 4 and 6 s with a lastFrame (checked on 2026-10-15).
 */
export function veoClipSeconds(request: Pick<VideoRequest, "durationSeconds" | "loop">): VeoDuration {
  return request.loop === false ? roundVeoDuration(request.durationSeconds) : 8;
}

/** Body for POST {base}/models/{model}:predictLongRunning. */
export function buildVeoRequest(request: VideoRequest): Record<string, unknown> {
  const frame = {
    bytesBase64Encoded: Buffer.from(request.image).toString("base64"),
    mimeType: request.imageContentType,
  };
  return {
    instances: [
      {
        prompt: buildVeoPrompt(request.prompt),
        image: frame,
        // The same picture as the last frame: the clip loops seamlessly and Veo
        // cannot drift away from the illustration (new objects, growing characters).
        ...(request.loop === false ? {} : { lastFrame: frame }),
      },
    ],
    parameters: {
      aspectRatio: request.aspect ?? "16:9",
      durationSeconds: veoClipSeconds(request),
      resolution: "720p",
      personGeneration: "allow_adult",
    },
  };
}

interface VeoSample {
  video?: { uri?: string };
}

export interface VeoOperation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: VeoSample[];
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
    generatedVideos?: VeoSample[];
  };
}

export type VeoOperationState =
  | { kind: "pending" }
  | { kind: "done"; uri: string }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/** True when an error message reads like a content-policy refusal. */
export function isPolicyMessage(message: string | undefined): boolean {
  return message !== undefined && POLICY_PATTERN.test(message);
}

/** Interprets one Operation body (from the initial POST or a poll). */
export function parseVeoOperation(body: VeoOperation): VeoOperationState {
  if (body.error) {
    const message = body.error.message ?? body.error.status ?? `code ${body.error.code ?? "unknown"}`;
    return isPolicyMessage(message) ? { kind: "refused", reason: message } : { kind: "error", message };
  }
  if (!body.done) return { kind: "pending" };
  const result = body.response?.generateVideoResponse;
  const samples = result?.generatedSamples ?? body.response?.generatedVideos ?? [];
  const uri = samples.find((sample) => typeof sample.video?.uri === "string" && sample.video.uri)?.video?.uri;
  if (uri) return { kind: "done", uri };
  const reasons = result?.raiMediaFilteredReasons?.filter(Boolean) ?? [];
  if ((result?.raiMediaFilteredCount ?? 0) > 0 || reasons.length > 0) {
    return { kind: "refused", reason: reasons.join(" ") || "the video was removed by the safety filter" };
  }
  return { kind: "error", message: "the operation finished without a video" };
}

/** Estimated USD cost at 720p, or undefined for a model not in the price table. */
export function veoCostUsd(model: string, seconds: number): number | undefined {
  const price = VEO_PRICE_PER_SECOND_720P[model];
  return price === undefined ? undefined : Math.round(price * seconds * 100) / 100;
}

// --- Provider ------------------------------------------------------------------------

export interface GeminiVideoOptions {
  /** Default 10 s. */
  pollIntervalMs?: number;
  /** Whole call, including the download. Default 8 minutes. */
  timeoutMs?: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function createGeminiVideoProvider(
  apiKey: string,
  model: string = VEO_DEFAULT_MODEL,
  options: GeminiVideoOptions = {},
): VideoProvider {
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? TOTAL_TIMEOUT_MS;
  const headers = { "content-type": "application/json", "x-goog-api-key": apiKey };

  return {
    name: "gemini",
    isMock: false,
    async animate(request: VideoRequest, signal?: AbortSignal): Promise<VideoResult> {
      if (!IMAGE_TYPES.has(request.imageContentType)) {
        throw new VideoProviderError(
          `Veo needs a PNG, JPEG or WebP first frame, got "${request.imageContentType}". Convert the illustration first.`,
        );
      }
      signal?.throwIfAborted();
      const deadline = AbortSignal.timeout(timeoutMs);
      const overall = signal ? AbortSignal.any([signal, deadline]) : deadline;
      const durationSeconds = veoClipSeconds(request);

      /** Rethrows the caller's abort as-is; turns our own deadline into a clear error. */
      const failIfStopped = (operationName?: string): void => {
        if (signal?.aborted) throw signal.reason;
        if (deadline.aborted) {
          throw new VideoProviderError(
            `Veo did not finish within ${Math.round(timeoutMs / 1000)} s` +
              (operationName ? ` (operation ${operationName}).` : "."),
          );
        }
      };
      const call = async (url: string, init: RequestInit, perCallMs: number, what: string): Promise<Response> => {
        try {
          return await fetch(url, { ...init, signal: AbortSignal.any([overall, AbortSignal.timeout(perCallMs)]) });
        } catch (err) {
          failIfStopped();
          throw new VideoProviderError(
            `Veo ${what} did not complete (${err instanceof Error ? err.name : "network error"}).`,
          );
        }
      };

      // 1. Start the long-running operation.
      const start = await call(
        `${VEO_BASE_URL}/models/${encodeURIComponent(model)}:predictLongRunning`,
        { method: "POST", headers, body: JSON.stringify(buildVeoRequest(request)) },
        REQUEST_TIMEOUT_MS,
        "request",
      );
      const started = await readJson<VeoOperation>(start);
      if (!start.ok) {
        const message = started?.error?.message ?? "no details";
        if (start.status === 400 && isPolicyMessage(message)) throw new VideoRefusedError(`Veo refused the input: ${message}`);
        if (start.status === 429) throw new VideoQuotaError(`Veo quota exceeded (HTTP 429): ${message}`);
        throw new VideoProviderError(`Veo request failed with HTTP ${start.status}: ${message}`);
      }
      if (!started?.name) throw new VideoProviderError("Veo did not return an operation name.");
      const operationName = started.name;

      // 2. Poll until done.
      let state = parseVeoOperation(started);
      let failures = 0;
      while (state.kind === "pending") {
        try {
          await sleep(pollIntervalMs, overall);
        } catch {
          failIfStopped(operationName);
        }
        let poll: Response;
        try {
          poll = await call(`${VEO_BASE_URL}/${operationName}`, { headers }, REQUEST_TIMEOUT_MS, "status check");
        } catch (err) {
          if (!overall.aborted && err instanceof VideoProviderError && ++failures < MAX_POLL_FAILURES) continue;
          throw err;
        }
        const body = await readJson<VeoOperation>(poll);
        if (!poll.ok) {
          if ((poll.status >= 500 || poll.status === 429) && ++failures < MAX_POLL_FAILURES) continue;
          throw new VideoProviderError(
            `Veo status check failed with HTTP ${poll.status}: ${body?.error?.message ?? "no details"}`,
          );
        }
        if (!body) throw new VideoProviderError("Veo status check returned no JSON body.");
        failures = 0;
        state = parseVeoOperation(body);
      }
      if (state.kind === "refused") throw new VideoRefusedError(`Veo refused the input: ${state.reason}`);
      if (state.kind === "error") throw new VideoProviderError(`Veo generation failed: ${state.message}`);

      // 3. Download right away (Google deletes the file after 2 days).
      const download = await call(state.uri, { headers: { "x-goog-api-key": apiKey } }, DOWNLOAD_TIMEOUT_MS, "download");
      if (!download.ok) throw new VideoProviderError(`Veo video download failed with HTTP ${download.status}.`);
      let video: Uint8Array;
      try {
        video = new Uint8Array(await download.arrayBuffer());
      } catch {
        failIfStopped(operationName);
        throw new VideoProviderError("Veo video download was interrupted.");
      }
      if (video.byteLength === 0) throw new VideoProviderError("Veo video download was empty.");
      const headerType = download.headers.get("content-type")?.split(";")[0].trim();

      return {
        video,
        contentType: headerType && headerType.startsWith("video/") ? headerType : "video/mp4",
        durationSeconds,
        isMock: false,
        usage: { costUsd: veoCostUsd(model, durationSeconds) },
      };
    },
  };
}

export function createVideoProvider(): VideoProvider {
  const vendor = aiEnv.videoProvider()?.toLowerCase() ?? "";
  if (vendor !== "gemini") {
    // Unknown vendor: fail loudly rather than silently returning the placeholder clip.
    throw new ProviderNotImplementedError(vendor || "video", "src/lib/ai/providers/video.ts");
  }
  const apiKey = aiEnv.videoApiKey();
  if (!apiKey) throw new VideoProviderError("VIDEO_PROVIDER=gemini requires VIDEO_API_KEY.");
  return createGeminiVideoProvider(apiKey, aiEnv.videoModel() ?? VEO_DEFAULT_MODEL);
}
