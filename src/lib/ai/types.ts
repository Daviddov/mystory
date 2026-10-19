/**
 * Provider interfaces. Every AI vendor sits behind one of these four, so a
 * vendor can be swapped without touching the rest of the code.
 *
 * Every result carries `isMock`. When it is true the output is a placeholder
 * and the UI MUST say so (demo voice notice, "sample illustration" badge...).
 */
import { z } from "zod";
import type { WordTiming } from "../types";

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Estimated cost of this call in USD, when the provider can tell. */
  costUsd?: number;
}

// --- Text ---------------------------------------------------------------------

export interface TextRequest<T> {
  system?: string;
  prompt: string;
  /** The response is parsed and validated against this schema. */
  schema: z.ZodType<T>;
  /** Short name for the structured output (letters, digits, underscore). */
  schemaName?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * What the MOCK provider should return for this request. Real providers
   * ignore it. Without it the mock returns its fixed sample story, which only
   * validates against GeneratedStorySchema-compatible schemas.
   */
  mockData?: T;
}

export interface TextResult<T> {
  data: T;
  isMock: boolean;
  usage?: AiUsage;
}

export interface TextProvider {
  readonly name: string;
  readonly isMock: boolean;
  /** Structured JSON output validated with `schema`. Throws when the model output does not validate. */
  generate<T>(request: TextRequest<T>): Promise<TextResult<T>>;
}

/** Canonical shape of a generated story. The mock text provider returns exactly this. */
export const GeneratedStorySchema = z.object({
  title: z.string(),
  summary: z.string(),
  pages: z.array(
    z.object({
      text: z.string(),
      /** Scene description for the illustrator, in English or Hebrew. */
      illustrationPrompt: z.string(),
    }),
  ),
  discussionQuestions: z.array(z.string()),
  /** Category slugs from taxonomy.ts. */
  categories: z.array(z.string()),
  /** Theme slugs from taxonomy.ts. */
  themes: z.array(z.string()),
  /** Hebrew tag labels. */
  tags: z.array(z.string()),
});
export type GeneratedStory = z.infer<typeof GeneratedStorySchema>;

// --- Nikud --------------------------------------------------------------------

export interface NikudResult {
  /** Vocalized text. The mock returns the input unchanged. */
  text: string;
  isMock: boolean;
}

export interface NikudProvider {
  readonly name: string;
  readonly isMock: boolean;
  /** Must preserve the number and order of whitespace-separated words (see splitWords in hebrew.ts). */
  addNikud(text: string): Promise<NikudResult>;
}

// --- Text to speech -------------------------------------------------------------

export interface TtsOptions {
  voice?: string;
  /** 1 = normal speed. */
  speed?: number;
  /** Narration style preset slug (NARRATION_STYLES in generation/presets.ts); unknown slugs are ignored. */
  style?: string;
  /**
   * Free-text narration wishes (at most 300 characters, cleaned). Honoured only by a
   * provider that can take free text; ElevenLabs cannot and ignores them.
   */
  notes?: string;
  /** Cancels the call (the caller's own deadline, or a request the user abandoned). */
  signal?: AbortSignal;
}

export interface TtsResult {
  audio: Uint8Array;
  /** e.g. "audio/mpeg" or "audio/wav". Use extensionForContentType() to name the file. */
  contentType: string;
  /** One entry per splitWords(text) token, in order. */
  wordTimings: WordTiming[];
  durationSeconds: number;
  /** True for the silent demo track; store Page.audioSource = "mock" in that case. */
  isMock: boolean;
  usage?: AiUsage;
}

export interface TtsProvider {
  readonly name: string;
  readonly isMock: boolean;
  /** `text` should be the vocalized text when available; pronunciation depends on it. */
  synthesize(text: string, options?: TtsOptions): Promise<TtsResult>;
}

// --- Images -----------------------------------------------------------------------

export interface ImageReference {
  bytes: Uint8Array;
  contentType: string;
  /** What the reference shows, e.g. "character sheet of the hero". */
  description?: string;
}

export interface ImageRequest {
  /** Full scene description. */
  prompt: string;
  /** Character sheet / child photo used to keep the hero consistent between pages. */
  referenceImages?: ImageReference[];
  /** Illustration style slug (see ILLUSTRATION_STYLES in taxonomy.ts) or free text. */
  style: string;
  /** Short Hebrew caption; the mock draws it on the placeholder. Defaults to the prompt. */
  caption?: string;
  /** Default 4:3 landscape, the reader's illustration frame. */
  aspect?: "4:3" | "1:1" | "3:4";
}

export interface ImageResult {
  image: Uint8Array;
  /** e.g. "image/png"; the mock returns "image/svg+xml". */
  contentType: string;
  isMock: boolean;
  usage?: AiUsage;
}

export interface ImageProvider {
  readonly name: string;
  readonly isMock: boolean;
  generate(request: ImageRequest): Promise<ImageResult>;
}

// --- Video (animate an illustration) -------------------------------------------------

export interface VideoRequest {
  /** The illustration to animate; it becomes the first frame. */
  image: Uint8Array;
  /** "image/png", "image/jpeg" or "image/webp". */
  imageContentType: string;
  /** What should move, e.g. "the leaves sway gently, the girl blinks". Gentle motion only. */
  prompt: string;
  /** Clip length; providers round to the nearest length they support. Default 4. */
  durationSeconds?: number;
  /** Default "16:9". The vendor letterboxes an image of another shape; the reader crops the bars. */
  aspect?: "16:9" | "9:16";
  /** End on the same frame it starts on, so the clip loops without a jump. Default true. */
  loop?: boolean;
}

export interface VideoResult {
  video: Uint8Array;
  /** e.g. "video/mp4". */
  contentType: string;
  durationSeconds: number;
  /** True for the demo placeholder; store Page.videoSource = "mock" in that case. */
  isMock: boolean;
  usage?: AiUsage;
}

export interface VideoProvider {
  readonly name: string;
  readonly isMock: boolean;
  /** Long-running (seconds to minutes). Honors `signal`. */
  animate(request: VideoRequest, signal?: AbortSignal): Promise<VideoResult>;
}

/** Thrown when the vendor refuses the input (e.g. a safety filter on people/children). Not retryable. */
export class VideoRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoRefusedError";
  }
}

/**
 * Thrown when the vendor's quota or rate limit is used up (HTTP 429). Every
 * further request would fail the same way, so a batch should stop.
 */
export class VideoQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoQuotaError";
  }
}

// --- Errors and status -------------------------------------------------------------

/** Thrown by a real provider file that has not been implemented yet. */
export class ProviderNotImplementedError extends Error {
  constructor(provider: string, file: string) {
    super(`AI provider "${provider}" is configured but not implemented yet (${file}).`);
    this.name = "ProviderNotImplementedError";
  }
}

export interface AiProviderStatus {
  /** Provider name, e.g. "mock", "claude", "dicta". */
  name: string;
  isMock: boolean;
}

export interface AiStatus {
  text: AiProviderStatus;
  nikud: AiProviderStatus;
  tts: AiProviderStatus;
  image: AiProviderStatus;
  video: AiProviderStatus;
  /** True when at least one provider is a mock. */
  anyMock: boolean;
}
