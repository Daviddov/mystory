/**
 * Claude text provider. Selected by src/lib/ai/index.ts when ANTHROPIC_API_KEY
 * is set; the model is ANTHROPIC_MODEL or claude-opus-5-5.
 *
 * Structured output: every request carries a Zod schema, sent as
 * `output_config.format` and parsed by the SDK (`messages.parse`), then
 * validated again with the caller's schema.
 *
 * Notes for callers:
 *  - `TextRequest.temperature` is ignored: current Claude models reject
 *    sampling parameters.
 *  - `TextRequest.mockData` is ignored (it is for the mock provider only).
 *  - Besides TextProvider this provider implements `generateWithImages`
 *    (VisionTextProvider in src/lib/generation/vision.ts).
 *  - This file has no "server-only" import so the daily-story CLI can use it;
 *    it must still never be imported from client code (it reads the API key).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiEnv } from "../../config";
import type { VisionImage, VisionTextProvider } from "../../generation/vision";
import type { AiUsage, TextRequest, TextResult } from "../types";

const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_MAX_TOKENS = 16000;

/** USD per million tokens (input, output). Used only to estimate cost; unknown models report no cost. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** Models for which the API can re-run a declined request on a fallback model (`fallbacks: "default"`). */
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const VISION_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type VisionMediaType = (typeof VISION_MEDIA_TYPES)[number];

/** Raised for failures a caller may want to tell apart (refusal, truncated or unparseable output). */
export class ClaudeTextError extends Error {
  constructor(
    readonly reason: "refusal" | "max_tokens" | "no_output" | "auth" | "rate_limit" | "api",
    message: string,
  ) {
    super(message);
    this.name = "ClaudeTextError";
  }
}

function estimateUsage(model: string, usage: Anthropic.Beta.BetaUsage): AiUsage {
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const inputTokens = usage.input_tokens + cacheWrite + cacheRead;
  const price = PRICES[model];
  const costUsd = price
    ? ((usage.input_tokens + cacheWrite * 1.25 + cacheRead * 0.1) * price.input +
        usage.output_tokens * price.output) /
      1_000_000
    : undefined;
  return { inputTokens, outputTokens: usage.output_tokens, ...(costUsd !== undefined ? { costUsd } : {}) };
}

export async function createClaudeTextProvider(): Promise<VisionTextProvider> {
  const apiKey = aiEnv.anthropicApiKey();
  const model = aiEnv.anthropicModel() ?? DEFAULT_MODEL;
  // With no explicit key the SDK resolves credentials from the environment.
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const useFallbacks = SERVER_FALLBACK_MODELS.has(model);

  async function run<T>(request: TextRequest<T>, images: VisionImage[]): Promise<TextResult<T>> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.map((image): Anthropic.Beta.BetaImageBlockParam => {
        const mediaType = VISION_MEDIA_TYPES.find((type) => type === image.contentType);
        if (!mediaType) throw new ClaudeTextError("api", "unsupported image type for vision input");
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType satisfies VisionMediaType,
            data: Buffer.from(image.bytes).toString("base64"),
          },
        };
      }),
      { type: "text", text: request.prompt },
    ];

    let message;
    try {
      message = await client.beta.messages.parse({
        model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: "user", content }],
        output_config: { format: betaZodOutputFormat(request.schema) },
        // On a safety decline the API retries the same request on a fallback model.
        ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      });
    } catch (err) {
      // SDK errors carry the status and the API's message, never the request body.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new ClaudeTextError("auth", "Claude rejected the API key (check ANTHROPIC_API_KEY).");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new ClaudeTextError("rate_limit", "Claude rate limit reached; try again later.");
      }
      if (err instanceof Anthropic.APIError) {
        throw new ClaudeTextError("api", `Claude API error ${err.status ?? "(network)"}: ${err.message}`);
      }
      throw err;
    }

    if (message.stop_reason === "refusal") {
      throw new ClaudeTextError(
        "refusal",
        `Claude declined the request (${message.stop_details?.category ?? "no category"}).`,
      );
    }
    if (message.stop_reason === "max_tokens") {
      throw new ClaudeTextError("max_tokens", "Claude's answer was cut off at max_tokens.");
    }
    if (message.parsed_output === null || message.parsed_output === undefined) {
      throw new ClaudeTextError("no_output", "Claude returned no structured output.");
    }

    // The response's `model` is the one that actually answered (it differs after a fallback).
    return {
      data: request.schema.parse(message.parsed_output),
      isMock: false,
      usage: estimateUsage(message.model, message.usage),
    };
  }

  return {
    name: "claude",
    isMock: false,
    generate: (request) => run(request, []),
    generateWithImages: (request, images) => run(request, images),
  };
}
