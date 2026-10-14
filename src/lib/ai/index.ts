/**
 * AI entry point. Server only. Each getter returns the real provider when its
 * env vars are set and the mock otherwise:
 *
 *   text   ANTHROPIC_API_KEY       -> providers/claude-text.ts
 *   nikud  NIKUD_PROVIDER=dicta    -> providers/dicta-nikud.ts
 *   tts    TTS_PROVIDER=<vendor>   -> providers/tts.ts
 *   image  IMAGE_PROVIDER=<vendor> -> providers/image.ts
 *   video  VIDEO_PROVIDER=<vendor> -> providers/video.ts  (gemini = Veo; key VIDEO_API_KEY or IMAGE_API_KEY)
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

function isTextConfigured(): boolean {
  return aiEnv.anthropicApiKey() !== undefined;
}
function isNikudConfigured(): boolean {
  return aiEnv.nikudProvider()?.toLowerCase() === "dicta";
}
function isTtsConfigured(): boolean {
  const name = aiEnv.ttsProvider()?.toLowerCase();
  return name !== undefined && name !== "mock";
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
  if (!isTextConfigured()) return mockTextProvider;
  return (await import("./providers/claude-text")).createClaudeTextProvider();
}

export async function getNikudProvider(): Promise<NikudProvider> {
  if (!isNikudConfigured()) return mockNikudProvider;
  return (await import("./providers/dicta-nikud")).createDictaNikudProvider();
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
  const text = { name: isTextConfigured() ? "claude" : "mock", isMock: !isTextConfigured() };
  const nikud = { name: isNikudConfigured() ? "dicta" : "mock", isMock: !isNikudConfigured() };
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
