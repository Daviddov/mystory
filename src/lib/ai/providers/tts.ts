/**
 * Text to speech. Selected when TTS_PROVIDER is set: "gemini" (Google AI Studio,
 * ./gemini-tts.ts, estimated word timings) or "elevenlabs" (this file, exact timings).
 *
 * Environment:
 *   TTS_PROVIDER       "elevenlabs"
 *   TTS_API_KEY        ElevenLabs API key (required)
 *   TTS_VOICE          voice id (required; pick a voice that sounds right in Hebrew)
 *   TTS_MODEL          model id, default "eleven_v3"
 *   TTS_OUTPUT_FORMAT  default "mp3_44100_128"; only mp3_* and wav_* are accepted here
 *   TTS_REGION         optional data residency: "us", "eu", "in" or "sg"
 *   TTS_STRIP_NIKUD    "1" sends the text without nikud (timings still match the vocalized words)
 *
 * VERIFIED against the ElevenLabs API reference on 2026-10-13
 * (https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps,
 *  https://elevenlabs.io/docs/api-reference/authentication,
 *  https://elevenlabs.io/docs/overview/models):
 *
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=...
 *   headers: xi-api-key, Content-Type: application/json
 *   body:    { text, model_id, language_code?, voice_settings?: { speed } }
 *   200:     { audio_base64, alignment: { characters[], character_start_times_seconds[],
 *              character_end_times_seconds[] } | null, normalized_alignment }
 *
 * Narration styles (generation/presets.ts) map to `voice_settings`
 * { stability, style, similarity_boost, speed }. eleven_v3 accepts only the
 * stability values 0 (creative), 0.5 (natural) and 1 (robust), so the preset's
 * value is snapped to the nearest. A preset's audio tag (e.g. "[whispers]") is
 * prepended to the sent text on eleven_v3 only; the tag's characters are dropped
 * from the alignment again. Free-text `notes` cannot be honoured and are ignored.
 *
 * `alignment` times the characters of the ORIGINAL text, which is what the
 * word highlighting needs. Hebrew is listed for eleven_v4, eleven_v4_turbo and
 * eleven_v3, and NOT for eleven_multilingual_v2 or eleven_flash_v2_5.
 * `language_code` is documented as unsupported on multilingual_v2 models, so it
 * is only sent to other models.
 *
 * NOT VERIFIED (no API key was available): a real request has never been made
 * from this code. In particular it is untested how well the model reads
 * vocalized Hebrew, whether `alignment` is always present for eleven_v3, and
 * what the request costs (no usage is reported).
 */
import { z } from "zod";
import { aiEnv } from "../../config";
import { stripNikud } from "../../hebrew";
import { getNarrationStyle } from "../../generation/presets";
import { alignWords, type CharacterAlignment } from "../../narration/align";
import type { TtsProvider } from "../types";

const DEFAULT_MODEL = "eleven_v3";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const REQUEST_TIMEOUT_MS = 180_000;

/** Hosts from the "Servers" list of the API reference. */
const REGION_HOSTS: Record<string, string> = {
  us: "https://api.us.elevenlabs.io",
  eu: "https://api.eu.residency.elevenlabs.io",
  in: "https://api.in.residency.elevenlabs.io",
  sg: "https://api.sg.residency.elevenlabs.io",
};
const DEFAULT_HOST = "https://api.elevenlabs.io";

const AlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

const WithTimestampsResponseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: AlignmentSchema.nullish(),
  normalized_alignment: AlignmentSchema.nullish(),
});

/** ElevenLabs accepts a speed between 0.7 and 1.2. */
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapStability(value: number): number {
  return [0, 0.5, 1].reduce((best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best), 0.5);
}

/**
 * The `voice_settings` of a request, or undefined when nothing differs from the
 * voice's defaults. `speed` is multiplied with the preset's own speed.
 */
export function buildVoiceSettings(
  options: { style?: string; speed?: number } | undefined,
  model: string,
): Record<string, number> | undefined {
  const preset = getNarrationStyle(options?.style);
  const userSpeed = options?.speed && options.speed > 0 ? options.speed : 1;
  const speed = clamp((preset?.speed ?? 1) * userSpeed, MIN_SPEED, MAX_SPEED);
  if (!preset) return speed !== 1 ? { speed } : undefined;
  const { stability, style, similarityBoost } = preset.voiceSettings;
  return {
    stability: model.startsWith("eleven_v3") ? snapStability(stability) : stability,
    style,
    ...(similarityBoost !== undefined ? { similarity_boost: similarityBoost } : {}),
    speed,
  };
}

/** The audio tag to prepend for a style, or undefined (only eleven_v3 understands tags). */
export function audioTagFor(styleSlug: string | undefined, model: string): string | undefined {
  if (!model.startsWith("eleven_v3")) return undefined;
  return getNarrationStyle(styleSlug)?.audioTag;
}

/**
 * Removes the first `prefix.length` characters from a character alignment (the
 * audio tag and its space that were sent in front of the real text), so the
 * rest times the original text.
 */
export function dropAlignmentPrefix(alignment: CharacterAlignment, prefix: string): CharacterAlignment {
  let remaining = prefix.length;
  let cut = 0;
  while (cut < alignment.characters.length && remaining > 0) {
    remaining -= alignment.characters[cut].length;
    cut++;
  }
  return {
    characters: alignment.characters.slice(cut),
    startTimes: alignment.startTimes.slice(cut),
    endTimes: alignment.endTimes.slice(cut),
  };
}

export class TtsProviderError extends Error {
  constructor(message: string) {
    super(`TTS: ${message}`);
    this.name = "TtsProviderError";
  }
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function contentTypeForOutputFormat(format: string): string {
  if (format.startsWith("mp3_")) return "audio/mpeg";
  if (format.startsWith("wav_")) return "audio/wav";
  throw new TtsProviderError(
    `TTS_OUTPUT_FORMAT "${format}" is not supported here; use an mp3_* or wav_* format`,
  );
}

export async function createTtsProvider(): Promise<TtsProvider> {
  const vendor = (aiEnv.ttsProvider() ?? "").toLowerCase();
  if (vendor === "gemini") return (await import("./gemini-tts")).createGeminiTtsProvider();
  if (vendor !== "elevenlabs") {
    throw new TtsProviderError(
      `TTS_PROVIDER "${vendor}" is not implemented. Use "gemini" or "elevenlabs", or unset it for the demo voice.`,
    );
  }
  const apiKey = aiEnv.ttsApiKey();
  if (!apiKey) throw new TtsProviderError("TTS_API_KEY is not set");
  const defaultVoice = aiEnv.ttsVoice();
  const model = env("TTS_MODEL") ?? DEFAULT_MODEL;
  const outputFormat = env("TTS_OUTPUT_FORMAT") ?? DEFAULT_OUTPUT_FORMAT;
  const contentType = contentTypeForOutputFormat(outputFormat);
  const sendWithoutNikud = env("TTS_STRIP_NIKUD") === "1";

  const region = aiEnv.ttsRegion()?.toLowerCase();
  if (region && !REGION_HOSTS[region]) {
    throw new TtsProviderError(`TTS_REGION "${region}" is unknown; use one of ${Object.keys(REGION_HOSTS).join(", ")}`);
  }
  const host = region ? REGION_HOSTS[region] : DEFAULT_HOST;

  return {
    name: "elevenlabs",
    isMock: false,
    async synthesize(text, options) {
      const voice = options?.voice ?? defaultVoice;
      if (!voice) throw new TtsProviderError("no voice: set TTS_VOICE to an ElevenLabs voice id");

      const tag = audioTagFor(options?.style, model);
      const prefix = tag ? `${tag} ` : "";
      const body: Record<string, unknown> = {
        text: prefix + (sendWithoutNikud ? stripNikud(text) : text),
        model_id: model,
      };
      if (!model.includes("multilingual_v2")) body.language_code = "he";
      const voiceSettings = buildVoiceSettings(options, model);
      if (voiceSettings) body.voice_settings = voiceSettings;

      const url = `${host}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: options?.signal
            ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), options.signal])
            : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TtsProviderError(`request failed (${err instanceof Error ? err.message : String(err)})`);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new TtsProviderError(`ElevenLabs answered HTTP ${response.status} ${detail.slice(0, 300)}`);
      }

      const parsed = WithTimestampsResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new TtsProviderError("the ElevenLabs response has an unexpected shape");
      const alignment = parsed.data.alignment;
      if (!alignment) {
        throw new TtsProviderError(
          `ElevenLabs returned no character alignment for model "${model}", so the words cannot be highlighted`,
        );
      }

      const audio = new Uint8Array(Buffer.from(parsed.data.audio_base64, "base64"));
      const durationSeconds = alignment.character_end_times_seconds.reduce((max, end) => Math.max(max, end), 0);
      let characters: CharacterAlignment = {
        characters: alignment.characters,
        startTimes: alignment.character_start_times_seconds,
        endTimes: alignment.character_end_times_seconds,
      };
      if (prefix) characters = dropAlignmentPrefix(characters, prefix);
      const { wordTimings } = alignWords(text, characters, { durationSeconds });

      return { audio, contentType, wordTimings, durationSeconds, isMock: false };
    },
  };
}
