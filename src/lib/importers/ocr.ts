/**
 * Text recognition for imported page images, using Claude vision.
 *
 * The shared TextProvider interface (src/lib/ai/types.ts) takes text prompts
 * only and has no image input, so this module calls the Anthropic SDK directly
 * with the same configuration (ANTHROPIC_API_KEY, ANTHROPIC_MODEL).
 *
 * There is NO mock: without a key isOcrAvailable() is false, the import page
 * hides the option and the API route answers 503.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiEnv } from "../config";

const DEFAULT_MODEL = "claude-opus-5-5";

/** Models that accept the server-side refusal fallback in its "default" form. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5-1|sonnet-5-5)/;

/** Image types the vision API accepts. SVG and AVIF pages cannot be recognised. */
export const OCR_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type OcrMediaType = (typeof OCR_MEDIA_TYPES)[number];

export function isOcrMediaType(value: string): value is OcrMediaType {
  return (OCR_MEDIA_TYPES as readonly string[]).includes(value);
}

export function isOcrAvailable(): boolean {
  return aiEnv.anthropicApiKey() !== undefined;
}

/** A failed recognition. `userMessage` is Hebrew and safe to show. */
export class OcrError extends Error {
  readonly status: number;
  readonly userMessage: string;

  constructor(status: number, userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.name = "OcrError";
    this.status = status;
    this.userMessage = userMessage;
  }
}

export interface OcrResult {
  text: string;
  /** True when the answer hit the output limit and the text may be cut off. */
  truncated: boolean;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const SYSTEM = [
  "You transcribe the text printed on one page of a children's picture book.",
  "Copy the story text exactly as printed: same language, same words, same punctuation,",
  "and keep Hebrew vocalization marks (nikud) when the page has them.",
  "Keep the reading order and put each printed line or paragraph on its own line.",
  "Leave out page numbers, publisher marks and text that is part of the illustration itself (signs, labels).",
  "Do not translate, correct, summarize or describe the picture.",
  "Answer with the transcription inside <text></text> tags and nothing else.",
  "When the page has no story text, answer with an empty <text></text>.",
].join(" ");

function parseTranscription(raw: string): string {
  const match = /<text>([\s\S]*?)(?:<\/text>|$)/.exec(raw);
  return (match ? match[1] : raw).trim();
}

/** Reads the story text of one page image. Throws OcrError. */
export async function extractPageText(image: Uint8Array, mediaType: OcrMediaType): Promise<OcrResult> {
  const apiKey = aiEnv.anthropicApiKey();
  if (!apiKey) throw new OcrError(503, "זיהוי הטקסט לא זמין באתר הזה.");

  const client = new Anthropic({ apiKey });
  const model = aiEnv.anthropicModel() ?? DEFAULT_MODEL;
  const useFallback = FALLBACK_MODELS.test(model);

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low" },
      // On a safety decline the API re-runs the request on a fallback model inside the same call.
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: Buffer.from(image).toString("base64") },
            },
            { type: "text", text: "Transcribe the story text on this page." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new OcrError(422, "לא הצלחנו לזהות טקסט בעמוד הזה. אפשר להקליד אותו ידנית.", "model refusal");
    }
    let raw = "";
    for (const block of response.content) {
      if (block.type === "text") raw += block.text;
    }
    return {
      text: parseTranscription(raw),
      truncated: response.stop_reason === "max_tokens",
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  } catch (err) {
    if (err instanceof OcrError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new OcrError(503, "זיהוי הטקסט לא זמין: מפתח השירות אינו תקין.", err.message);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new OcrError(429, "שירות זיהוי הטקסט עמוס כרגע. נסו שוב בעוד רגע.", err.message);
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new OcrError(422, "לא הצלחנו לקרוא את התמונה הזו. אפשר להקליד את הטקסט ידנית.", err.message);
    }
    if (err instanceof Anthropic.APIError) {
      throw new OcrError(502, "שירות זיהוי הטקסט לא זמין כרגע. נסו שוב בעוד רגע.", err.message);
    }
    throw err;
  }
}
