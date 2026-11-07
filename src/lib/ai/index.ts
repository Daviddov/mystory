/**
 * AI entry point. Server only. Each getter returns the real provider when its
 * env vars are set and the mock otherwise:
 *
 *   text   ANTHROPIC_API_KEY       -> providers/claude-text.ts
 *   nikud  NIKUD_PROVIDER=gemini   -> providers/gemini-nikud.ts (Dicta when Gemini fails; key TEXT_API_KEY)
 *          NIKUD_PROVIDER=dicta    -> providers/dicta-nikud.ts
 *   tts    TTS_PROVIDER=gemini     -> providers/tts.ts  (AI Studio, key TTS_API_KEY)
 *   image  IMAGE_PROVIDER=<vendor> -> providers/image.ts
 *   video  VIDEO_PROVIDER=<vendor> -> providers/video.ts  (gemini = Veo; key VIDEO_API_KEY)
 *
 * An unset *_PROVIDER with that service's key set picks Gemini, so a key alone is enough.
 *
 * Results always carry `isMock`; surface it in the UI.
 */
import "server-only";
import { aiEnv } from "../config";
import { mockImageProvider, mockNikudProvider, mockTextProvider, mockTtsProvider, mockVideoProvider } from "./mock";
import type {
  AiStatus,
  ImageProvider,
  ImageRequest,
  ImageResult,
  NikudProvider,
  NikudResult,
  TextProvider,
  TextRequest,
  TextResult,
  TtsOptions,
  TtsProvider,
  TtsResult,
  VideoProvider,
  VideoRequest,
  VideoResult,
} from "./types";

export * from "./types";
export { MOCK_STORY, MOCK_VIDEO_SECONDS, evenWordTimings, mockIllustrationSvg, mockVideoMp4, silentWav } from "./mock";

/** Gemini is the site's writer; Claude only when asked for (or as the old fallback), otherwise the mock. */
function textVendor(): "gemini" | "claude" | "mock" {
  const chosen = aiEnv.textProvider()?.toLowerCase();
  if (chosen === "mock") return "mock";
  if (chosen === "claude") return aiEnv.anthropicApiKey() !== undefined ? "claude" : "mock";
  if (chosen !== undefined && chosen !== "gemini") return "mock";
  if (chosen === "gemini") return aiEnv.textApiKey() !== undefined ? "gemini" : "mock";
  // Unset: a text key picks Gemini; an existing Claude site stays on Claude; otherwise the mock.
  if (aiEnv.textApiKey() !== undefined) return "gemini";
  return aiEnv.anthropicApiKey() !== undefined ? "claude" : "mock";
}
function isTextConfigured(): boolean {
  return textVendor() !== "mock";
}
/** Gemini first (Dicta when it fails), Dicta alone when asked for, otherwise the mock. */
function nikudVendor(): "gemini" | "dicta" | "mock" {
  const chosen = aiEnv.nikudProvider()?.toLowerCase();
  if (chosen === "dicta") return "dicta";
  if (chosen !== undefined && chosen !== "gemini") return "mock";
  if (aiEnv.textApiKey() !== undefined) return "gemini";
  // Asked for Gemini without a key: Dicta needs none.
  return chosen === "gemini" ? "dicta" : "mock";
}
function isNikudConfigured(): boolean {
  return nikudVendor() !== "mock";
}
// aiEnv.*Provider() already default to a vendor when only that service's key is set.
function isTtsConfigured(): boolean {
  const name = aiEnv.ttsProvider()?.toLowerCase();
  return name !== undefined && name !== "mock";
}
/** True when the active TTS vendor follows free-text narration notes (Gemini does, the demo voice does not). */
export function ttsHonoursNotes(): boolean {
  return isTtsConfigured() && aiEnv.ttsProvider()?.toLowerCase() === "gemini";
}
function isImageConfigured(): boolean {
  const name = aiEnv.imageProvider()?.toLowerCase();
  return name !== undefined && name !== "mock";
}
function isVideoConfigured(): boolean {
  const name = aiEnv.videoProvider()?.toLowerCase();
  return name !== undefined && name !== "mock";
}

export async function getTextProvider(): Promise<TextProvider> {
  const vendor = textVendor();
  if (vendor === "mock") return mockTextProvider;
  if (vendor === "claude") return (await import("./providers/claude-text")).createClaudeTextProvider();
  return (await import("./providers/gemini-text")).createGeminiTextProvider();
}

export async function getNikudProvider(): Promise<NikudProvider> {
  const vendor = nikudVendor();
  if (vendor === "mock") return mockNikudProvider;
  const dicta = await (await import("./providers/dicta-nikud")).createDictaNikudProvider();
  if (vendor === "dicta") return dicta;
  return (await import("./providers/gemini-nikud")).createGeminiNikudProvider({ fallback: dicta });
}

export async function getTtsProvider(): Promise<TtsProvider> {
  if (!isTtsConfigured()) return mockTtsProvider;
  return (await import("./providers/tts")).createTtsProvider();
}

export async function getImageProvider(): Promise<ImageProvider> {
  if (!isImageConfigured()) return mockImageProvider;
  return (await import("./providers/image")).createImageProvider();
}

export async function getVideoProvider(): Promise<VideoProvider> {
  if (!isVideoConfigured()) return mockVideoProvider;
  return (await import("./providers/video")).createVideoProvider();
}

/** Which providers are real and which are mocks, decided from env vars only (no network, no imports). */
export function getAiStatus(): AiStatus {
  const text = { name: textVendor(), isMock: !isTextConfigured() };
  const nikud = { name: nikudVendor(), isMock: !isNikudConfigured() };
  const tts = {
    name: isTtsConfigured() ? (aiEnv.ttsProvider() as string) : "mock",
    isMock: !isTtsConfigured(),
  };
  const image = {
    name: isImageConfigured() ? (aiEnv.imageProvider() as string) : "mock",
    isMock: !isImageConfigured(),
  };
  const video = {
    name: isVideoConfigured() ? (aiEnv.videoProvider() as string) : "mock",
    isMock: !isVideoConfigured(),
  };
  return {
    text,
    nikud,
    tts,
    image,
    video,
    anyMock: text.isMock || nikud.isMock || tts.isMock || image.isMock || video.isMock,
  };
}

// --- The four functions named in PLAN.md, plus animateImage -------------------------------------------

export async function generateText<T>(request: TextRequest<T>): Promise<TextResult<T>> {
  return (await getTextProvider()).generate(request);
}

export async function addNikud(text: string): Promise<NikudResult> {
  return (await getNikudProvider()).addNikud(text);
}

export async function synthesize(text: string, options?: TtsOptions): Promise<TtsResult> {
  return (await getTtsProvider()).synthesize(text, options);
}

export async function generateImage(request: ImageRequest): Promise<ImageResult> {
  return (await getImageProvider()).generate(request);
}

/** Turns an illustration into a short silent looping clip. Long-running; honors `signal`. */
export async function animateImage(request: VideoRequest, signal?: AbortSignal): Promise<VideoResult> {
  return (await getVideoProvider()).animate(request, signal);
}
