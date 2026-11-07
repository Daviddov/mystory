/**
 * Text to speech, selected with TTS_PROVIDER. Gemini (AI Studio, ./gemini-tts.ts)
 * is the only vendor; an unset provider means the demo voice (see ../index.ts).
 */
import { aiEnv } from "../../config";
import type { TtsProvider } from "../types";

export class TtsProviderError extends Error {
  constructor(message: string) {
    super(`TTS: ${message}`);
    this.name = "TtsProviderError";
  }
}

export async function createTtsProvider(): Promise<TtsProvider> {
  const vendor = (aiEnv.ttsProvider() ?? "").toLowerCase();
  if (vendor !== "gemini") {
    throw new TtsProviderError(`TTS_PROVIDER "${vendor}" is not implemented. Use "gemini", or unset it for the demo voice.`);
  }
  return (await import("./gemini-tts")).createGeminiTtsProvider();
}
