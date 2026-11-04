/**
 * Gemini text provider: the one story writer of the site. Selected by
 * src/lib/ai/index.ts when TEXT_PROVIDER=gemini, or when a Google key
 * (TEXT_API_KEY) is set and TEXT_PROVIDER is not.
 * The model is TEXT_MODEL or gemini-3.8-flash (gemini-2.5-flash was retired for new keys).
 *
 * Structured output: the caller's Zod schema is sent as `responseJsonSchema`
 * (generateContent with a JSON mime type); the reply is parsed and validated
 * again with the same schema.
 *
 * Also implements `generateWithImages` (VisionTextProvider), used to describe
 * the optional child photo.
 *
 * NOT exercised against the live API (no key was available when this was
 * written); shapes follow https://ai.google.dev/api/generate-content.
 * No "server-only" import, so the daily-story CLI can use it; it reads the API
 * key and must never be imported from client code.
 */
import { z } from "zod";
import { aiEnv } from "../../config";
import type { VisionImage, VisionTextProvider } from "../../generation/vision";
import type { AiUsage, TextRequest, TextResult } from "../types";

const DEFAULT_MODEL = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 16000;
const THINKING_BUDGET = 512;
const RETRY_STATUSES = new Set([429, 500, 503]);
const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class GeminiTextError extends Error {
  constructor(
    readonly reason: "blocked" | "max_tokens" | "no_output" | "auth" | "rate_limit" | "api",
    message: string,
  ) {
    super(message);
    this.name = "GeminiTextError";
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string; status?: string };
}

/** The caller's Zod schema as plain JSON Schema, without the keys Gemini does not list as supported. */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  let converted: Record<string, unknown>;
  try {
    converted = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    throw new GeminiTextError("api", "The response schema cannot be sent to Gemini.");
  }
  delete converted.$schema;
  delete converted.$id;
  return converted;
}

/** Request body for one structured call. Exported for tests. */
export function buildGeminiTextRequest<T>(request: TextRequest<T>, images: VisionImage[] = []): Record<string, unknown> {
  for (const image of images) {
    if (!VISION_TYPES.has(image.contentType)) throw new GeminiTextError("api", "unsupported image type for vision input");
  }
  return {
    ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((image) => ({
            inlineData: { mimeType: image.contentType, data: Buffer.from(image.bytes).toString("base64") },
          })),
          { text: request.prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchemaFor(request.schema),
      maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      // Thinking tokens count toward maxOutputTokens: a small budget keeps a long Hebrew story from being cut off.
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    },
  };
}

/** Reads the JSON text of the first candidate. Exported for tests. */
export function extractGeminiText(body: GeminiResponse): string {
  if (body.promptFeedback?.blockReason) {
    throw new GeminiTextError("blocked", `Gemini declined the request (${body.promptFeedback.blockReason}).`);
  }
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new GeminiTextError("max_tokens", "Gemini's answer was cut off at the token limit.");
  }
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new GeminiTextError("blocked", `Gemini declined the request (${candidate.finishReason}).`);
  }
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new GeminiTextError("no_output", "Gemini returned no output.");
  return text;
}

function usageOf(body: GeminiResponse): AiUsage {
  return { inputTokens: body.usageMetadata?.promptTokenCount, outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0) };
}

export async function createGeminiTextProvider(): Promise<VisionTextProvider> {
  const apiKey = aiEnv.textApiKey();
  if (!apiKey) throw new GeminiTextError("auth", "Gemini text needs TEXT_API_KEY.");
  const model = aiEnv.textModel() ?? DEFAULT_MODEL;

  async function run<T>(request: TextRequest<T>, images: VisionImage[]): Promise<TextResult<T>> {
    const payload = JSON.stringify(buildGeminiTextRequest(request, images));
    const call = () =>
      fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey as string },
        body: payload,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    let response: Response;
    try {
      response = await call();
      // One retry for a transient overload, so a multi-call story is not lost to a single 503.
      if (RETRY_STATUSES.has(response.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        response = await call();
      }
    } catch (err) {
      if (err instanceof GeminiTextError) throw err;
      throw new GeminiTextError(
        "api",
        `Gemini text request did not complete (${err instanceof Error ? err.name : "network error"}).`,
      );
    }

    let body: GeminiResponse;
    try {
      body = (await response.json()) as GeminiResponse;
    } catch {
      throw new GeminiTextError("api", `Gemini text request failed with HTTP ${response.status} (no JSON body).`);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new GeminiTextError("auth", "Gemini rejected the API key (check TEXT_API_KEY).");
      }
      if (response.status === 429) throw new GeminiTextError("rate_limit", "Gemini rate limit reached; try again later.");
      throw new GeminiTextError(
        "api",
        `Gemini text request failed with HTTP ${response.status}: ${body.error?.message ?? "no details"}`,
      );
    }

    const text = extractGeminiText(body);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GeminiTextError("no_output", "Gemini returned text that is not JSON.");
    }
    return { data: request.schema.parse(parsed), isMock: false, usage: usageOf(body) };
  }

  return {
    name: "gemini",
    isMock: false,
    generate: (request) => run(request, []),
    generateWithImages: (request, images) => run(request, images),
  };
}
