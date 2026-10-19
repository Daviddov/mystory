/**
 * Which narration voices the active TTS provider offers and allows. Reads env
 * only (no network), so routes, tests and the studio's server pages can use it.
 *
 *   gemini      the curated catalog (generation/presets.ts) + TTS_VOICE + TTS_ALLOWED_VOICES
 *   elevenlabs  TTS_VOICE + TTS_ALLOWED_VOICES (labelled by id)
 *   mock        none
 */
import { aiEnv } from "../config";
import {
  defaultNarrationVoice,
  getNarrationVoices,
  type NarrationVoice,
  type NarrationVoiceProvider,
} from "../generation/presets";

export function activeVoiceProvider(): NarrationVoiceProvider {
  const name = aiEnv.ttsProvider()?.toLowerCase();
  return name && name !== "mock" ? name : "mock";
}

export function availableNarrationVoices(): NarrationVoice[] {
  return getNarrationVoices(activeVoiceProvider(), aiEnv.ttsAllowedVoices());
}

/** The voice used when nothing is chosen (TTS_VOICE, else Gemini's default). */
export function fallbackNarrationVoice(): string | undefined {
  return defaultNarrationVoice(activeVoiceProvider(), aiEnv.ttsVoice());
}

/** True when `voice` may be requested: in the provider's catalog or in TTS_ALLOWED_VOICES. */
export function isAllowedNarrationVoice(voice: string): boolean {
  // TTS_ALLOWED_VOICES is honoured whatever the provider (also the demo voice), as before the catalog existed.
  return aiEnv.ttsAllowedVoices().includes(voice) || availableNarrationVoices().some((entry) => entry.id === voice);
}
