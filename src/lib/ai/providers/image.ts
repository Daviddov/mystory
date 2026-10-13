/**
 * Image provider. Selected by src/lib/ai/index.ts when IMAGE_PROVIDER is set
 * to something other than "mock".
 *
 * Implemented vendor: IMAGE_PROVIDER=gemini (Google Gemini native image
 * generation through the Interactions API), with IMAGE_API_KEY and optional
 * IMAGE_MODEL. Any other value fails loudly instead of returning mock art.
 *
 * Verified against Google's documentation on 2026-10-13:
 *   https://ai.google.dev/gemini-api/docs/image-generation
 *   https://ai.google.dev/api/interactions-api
 * What the docs state: POST {base}/v1beta/interactions, header
 * `x-goog-api-key`, body `model`, `input` (content blocks: {type:"text",text}
 * and {type:"image",mime_type,data}), `response_format`
 * {type:"image",aspect_ratio,image_size}; the result is read from `steps[]`
 * entries of type "model_output" whose `content[]` holds {type:"image",data,
 * mime_type} blocks, and `usage.total_input_tokens/total_output_tokens`.
 * What they do not show: a raw JSON response for an image request, and the
 * HTTP error body. The parser below therefore also accepts a top-level
 * `output_image` and treats an unexpected shape as an error.
 *
 * NOT exercised against the live API (no key was available when this was
 * written). No cost is reported: the pages above list no per-image price.
 *
 * No "server-only" import, so the daily-story CLI can use this file. It reads
 * the API key and must never be imported from client code.
 */
import { aiEnv } from "../../config";
import { ProviderNotImplementedError, type ImageProvider, type ImageRequest, type ImageResult } from "../types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_DEFAULT_MODEL = "gemini-nano-banana-2.1";
const REQUEST_TIMEOUT_MS = 120_000;
const REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_REFERENCES = 3;

export class ImageProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProviderError";
  }
}

interface GeminiImageBlock {
  type?: string;
  data?: string;
  mime_type?: string;
}

interface GeminiInteraction {
  status?: string;
  steps?: { type?: string; content?: GeminiImageBlock[] }[];
  output_image?: GeminiImageBlock;
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
  errors?: { code?: string; message?: string }[];
  error?: { message?: string; status?: string };
}

/** Finds the generated image in an Interaction response. Exported for tests. */
export function extractGeminiImage(body: GeminiInteraction): { data: string; mimeType: string } | null {
  for (const step of body.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "image" && typeof block.data === "string" && block.data.length > 0) {
        return { data: block.data, mimeType: block.mime_type ?? "image/png" };
      }
    }
  }
  const direct = body.output_image;
  if (direct && typeof direct.data === "string" && direct.data.length > 0) {
    return { data: direct.data, mimeType: direct.mime_type ?? "image/png" };
  }
  return null;
}

/** Request body for one illustration. Exported for tests. */
export function buildGeminiRequest(model: string, request: ImageRequest): Record<string, unknown> {
  const references = (request.referenceImages ?? [])
    .filter((reference) => REFERENCE_TYPES.has(reference.contentType))
    .slice(0, MAX_REFERENCES);
  const referenceNote =
    references.length > 0
      ? " Use the attached reference image" +
        (references.length > 1 ? "s" : "") +
        " to keep the main character identical: same face, hair, proportions, outfit and colours." +
        references.map((r) => (r.description ? ` (${r.description})` : "")).join("")
      : "";
  return {
    model,
    input: [
      { type: "text", text: request.prompt + referenceNote },
      ...references.map((reference) => ({
        type: "image",
        mime_type: reference.contentType,
        data: Buffer.from(reference.bytes).toString("base64"),
      })),
    ],
    response_format: { type: "image", aspect_ratio: request.aspect ?? "4:3", image_size: "1K" },
    store: false,
  };
}

function createGeminiImageProvider(apiKey: string, model: string): ImageProvider {
  return {
    name: "gemini",
    isMock: false,
    async generate(request: ImageRequest): Promise<ImageResult> {
      let response: Response;
      try {
        response = await fetch(GEMINI_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(buildGeminiRequest(model, request)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new ImageProviderError(
          `Gemini image request did not complete (${err instanceof Error ? err.name : "network error"}).`,
        );
      }

      let body: GeminiInteraction;
      try {
        body = (await response.json()) as GeminiInteraction;
      } catch {
        throw new ImageProviderError(`Gemini image request failed with HTTP ${response.status} (no JSON body).`);
      }
      if (!response.ok) {
        const detail = body.error?.message ?? body.errors?.[0]?.message ?? "no details";
        throw new ImageProviderError(`Gemini image request failed with HTTP ${response.status}: ${detail}`);
      }

      const found = extractGeminiImage(body);
      if (!found) {
        const detail = body.errors?.[0]?.message ?? `status ${body.status ?? "unknown"}`;
        throw new ImageProviderError(`Gemini returned no image (${detail}).`);
      }
      return {
        image: new Uint8Array(Buffer.from(found.data, "base64")),
        contentType: found.mimeType,
        isMock: false,
        usage: {
          inputTokens: body.usage?.total_input_tokens,
          outputTokens: body.usage?.total_output_tokens,
        },
      };
    },
  };
}

export async function createImageProvider(): Promise<ImageProvider> {
  const vendor = aiEnv.imageProvider()?.toLowerCase() ?? "";
  if (vendor !== "gemini") {
    // Unknown vendor: fail loudly rather than silently returning placeholder art.
    throw new ProviderNotImplementedError(vendor || "image", "src/lib/ai/providers/image.ts");
  }
  const apiKey = aiEnv.imageApiKey();
  if (!apiKey) throw new ImageProviderError("IMAGE_PROVIDER=gemini requires IMAGE_API_KEY.");
  return createGeminiImageProvider(apiKey, aiEnv.imageModel() ?? GEMINI_DEFAULT_MODEL);
}
