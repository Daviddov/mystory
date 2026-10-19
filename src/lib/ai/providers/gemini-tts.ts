/**
 * Text to speech with Google Gemini (AI Studio key). Selected with TTS_PROVIDER=gemini.
 *
 * Environment:
 *   TTS_PROVIDER   "gemini"
 *   TTS_API_KEY    AI Studio key; falls back to IMAGE_API_KEY, so one Google key serves text, pictures and voice
 *   TTS_MODEL      default "gemini-3.8-flash-tts"
 *   TTS_VOICE      default prebuilt voice (default "Sulafat"); more via NARRATION voices / TTS_ALLOWED_VOICES
 *
 * VERIFIED live on 2026-10-19 with an AI Studio key (and against
 * https://ai.google.dev/gemini-api/docs/speech-generation):
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   headers: x-goog-api-key, Content-Type: application/json
 *   body:    { model, input: [{ type: "user_input", content: [{ type: "text", text,
 *              annotations: [{ type: "speech_metadata", style }] }] }],
 *              response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
 *              generation_config: { speech_config: [{ voice }] } }
 *   200:     { steps: [{ type: "model_output", content: [{ type: "audio", data (base64),
 *              mime_type: "audio/l16; rate=24000; channels=1" }] }], usage }
 *
 * The older `models/{model}:generateContent` endpoint also returns audio, but it
 * only takes the style as words in the prompt, and the model then tends to read
 * the instruction aloud (measured: 6-8 s of audio for a 3 s sentence). The
 * interactions endpoint carries the delivery instruction in `speech_metadata.style`,
 * so the spoken text stays exactly the page text. The audio is raw 16-bit mono PCM
 * at 24 kHz; it is wrapped in a WAV header here (audio/wav).
 *
 * Style: the narration preset's English `prompt` plus the user's FREE-TEXT notes
 * are sent as that style, so unlike ElevenLabs the notes ARE honoured.
 *
 * WORD TIMINGS ARE ESTIMATED. Gemini TTS returns no timings, so the real audio
 * duration is shared out over the words by length (letters without nikud) plus a
 * small pause after punctuation and line ends. The highlighting can drift by a
 * fraction of a second; scripts/align-recordings.ts (STT_PROVIDER) remains the
 * optional precise route and is never called automatically.
 */
import { aiEnv } from "../../config";
import { DEFAULT_GEMINI_VOICE, getNarrationStyle } from "../../generation/presets";
import { splitWords, stripNikud } from "../../hebrew";
import type { WordTiming } from "../../types";
import type { TtsProvider, TtsResult } from "../types";

export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
export const GEMINI_TTS_SAMPLE_RATE = 24_000;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const REQUEST_TIMEOUT_MS = 180_000;
const RETRY_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 1500;
const MAX_STYLE_LENGTH = 600;

export type GeminiTtsErrorKind = "auth" | "billing" | "quota" | "api" | "no_audio";

/** Messages are Hebrew: the narration pipeline shows them to the user as they are. */
export class GeminiTtsError extends Error {
  constructor(
    readonly kind: GeminiTtsErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GeminiTtsError";
  }
}

// --- Style ------------------------------------------------------------------------------

/**
 * The delivery instruction: the preset's English prompt, then the user's notes.
 * Empty when there is neither. It goes to `speech_metadata.style` and is never spoken.
 */
export function buildStyleInstruction(options: { style?: string; notes?: string } | undefined): string {
  const preset = getNarrationStyle(options?.style);
  const notes = (options?.notes ?? "").replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  if (preset) parts.push(`Read ${preset.prompt}.`);
  if (notes) parts.push(`Extra wishes from the author: ${notes}`);
  return parts.join(" ").slice(0, MAX_STYLE_LENGTH);
}

// --- Request ----------------------------------------------------------------------------

export function buildGeminiTtsBody(
  text: string,
  options: { model: string; voice: string; style?: string },
): Record<string, unknown> {
  const style = options.style?.trim();
  return {
    model: options.model,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text,
            ...(style ? { annotations: [{ type: "speech_metadata", style }] } : {}),
          },
        ],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: GEMINI_TTS_SAMPLE_RATE },
    generation_config: { speech_config: [{ voice: options.voice }] },
  };
}

// --- Audio ------------------------------------------------------------------------------

/** Wraps raw 16-bit little-endian mono PCM in a 44-byte WAV (RIFF) header. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number = GEMINI_TTS_SAMPLE_RATE, channels = 1): Uint8Array {
  const bytesPerSample = 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // byte rate
  header.writeUInt16LE(channels * bytesPerSample, 32); // block align
  header.writeUInt16LE(bytesPerSample * 8, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.byteLength, 40);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(header, 0);
  out.set(pcm, 44);
  return out;
}

/** Duration in seconds of 16-bit PCM. */
export function pcmDurationSeconds(byteLength: number, sampleRate: number = GEMINI_TTS_SAMPLE_RATE, channels = 1): number {
  return byteLength / (sampleRate * channels * 2);
}

function sampleRateOf(mimeType: string | undefined, fallback: number): number {
  const match = /rate=(\d{4,6})/i.exec(mimeType ?? "");
  return match ? Number(match[1]) : fallback;
}

/** Turns the base64 audio of a response into a WAV file and its duration. */
export function audioToWav(base64: string, mimeType?: string): { wav: Uint8Array; durationSeconds: number } {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength === 0) throw new GeminiTtsError("no_audio", "Gemini החזיר שמע ריק.");
  const isWav = bytes.byteLength > 44 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF";
  if (isWav) {
    const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const rate = view.readUInt32LE(24) || GEMINI_TTS_SAMPLE_RATE;
    const channels = view.readUInt16LE(22) || 1;
    return { wav: bytes, durationSeconds: pcmDurationSeconds(bytes.byteLength - 44, rate, channels) };
  }
  const rate = sampleRateOf(mimeType, GEMINI_TTS_SAMPLE_RATE);
  return { wav: pcmToWav(bytes, rate), durationSeconds: pcmDurationSeconds(bytes.byteLength, rate) };
}

// --- Estimated word timings --------------------------------------------------------------

/** Pause lengths after a word, in "letters" of speaking time. */
const PAUSE_SOFT = 2; // , ; : and dashes
const PAUSE_HARD = 3.5; // . ! ? …
const PAUSE_LINE = 2; // a line break without punctuation (the end of a verse line)

function letterWeight(token: string): number {
  const letters = stripNikud(token).replace(/[^\p{L}\p{N}]/gu, "").length;
  return Math.max(1, letters);
}

function pauseWeight(token: string, gap: string): number {
  const punctuation = /([.!?…:;,־–—-])["'”’)»״]*$/u.exec(token.trim())?.[1];
  let pause = 0;
  if (punctuation) pause = /[.!?…]/.test(punctuation) ? PAUSE_HARD : PAUSE_SOFT;
  if (pause === 0 && /\n/.test(gap)) pause = PAUSE_LINE;
  if (pause > 0 && /\n\s*\n/.test(gap)) pause += 1;
  return pause;
}

/**
 * ESTIMATED timings: one entry per splitWords(text) token, spread over
 * `durationSeconds` in proportion to word length plus a pause after punctuation
 * and line ends. The first word starts at 0 and the last ends exactly at the duration.
 */
export function estimateWordTimings(text: string, durationSeconds: number): WordTiming[] {
  const words = splitWords(text);
  if (words.length === 0) return [];
  const letters: number[] = [];
  const pauses: number[] = [];
  let cursor = 0;
  words.forEach((word, i) => {
    const at = text.indexOf(word, cursor);
    let gap = "";
    if (at >= 0) {
      const end = at + word.length;
      const nextAt = i + 1 < words.length ? text.indexOf(words[i + 1], end) : -1;
      gap = nextAt >= 0 ? text.slice(end, nextAt) : "";
      cursor = end;
    }
    letters.push(letterWeight(word));
    pauses.push(i === words.length - 1 ? 0 : pauseWeight(word, gap));
  });
  const total = letters.reduce((sum, n, i) => sum + n + pauses[i], 0);
  const duration = Math.max(0, durationSeconds);
  const round = (n: number) => Number(n.toFixed(3));
  let at = 0;
  return words.map((word, i) => {
    const start = at;
    const end = at + (duration * letters[i]) / total;
    at = end + (duration * pauses[i]) / total;
    return { word, start: round(start), end: i === words.length - 1 ? round(duration) : round(end) };
  });
}

// --- Provider ----------------------------------------------------------------------------

interface InteractionResponse {
  steps?: { content?: { type?: string; data?: string; mime_type?: string }[] }[];
  error?: { message?: string; status?: string };
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
}

function findAudio(body: InteractionResponse): { data: string; mime_type?: string } | undefined {
  for (const step of body.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === "audio" && typeof part.data === "string" && part.data.length > 0) {
        return { data: part.data, mime_type: part.mime_type };
      }
    }
  }
  return undefined;
}

function isQuotaBody(body: InteractionResponse | null): boolean {
  const text = `${body?.error?.status ?? ""} ${body?.error?.message ?? ""}`;
  return /RESOURCE_EXHAUSTED|quota|rate limit/i.test(text);
}

/** Maps an error response to a Hebrew message. Exported for tests. */
export function geminiTtsErrorFor(status: number, body: InteractionResponse | null): GeminiTtsError {
  if (status === 401 || status === 403) {
    return new GeminiTtsError("auth", "Google דחתה את מפתח ה-API של ההקראה (TTS_API_KEY או IMAGE_API_KEY). פנו למנהל האתר.");
  }
  if (status === 402) {
    return new GeminiTtsError("billing", "אין מכסה או חיוב פעילים בחשבון Google של ההקראה. פנו למנהל האתר.");
  }
  if (status === 429 || isQuotaBody(body)) {
    return new GeminiTtsError("quota", "מכסת ההקראה של Google (קול Gemini) נוצלה כרגע. נסו שוב בעוד דקה, או מחר אם המכסה היומית נגמרה.");
  }
  return new GeminiTtsError("api", `ההקראה של Gemini נכשלה (HTTP ${status}). נסו שוב בעוד רגע.`);
}

export async function createGeminiTtsProvider(): Promise<TtsProvider> {
  const apiKey = aiEnv.geminiTtsApiKey();
  if (!apiKey) throw new GeminiTtsError("auth", "TTS_API_KEY (או IMAGE_API_KEY) לא הוגדר, ולכן אין הקראה של Gemini.");
  const model = aiEnv.ttsModel() ?? DEFAULT_GEMINI_TTS_MODEL;
  const defaultVoice = aiEnv.ttsVoice() ?? DEFAULT_GEMINI_VOICE;

  return {
    name: "gemini",
    isMock: false,
    async synthesize(text, options): Promise<TtsResult> {
      const voice = options?.voice ?? defaultVoice;
      const body = buildGeminiTtsBody(text, { model, voice, style: buildStyleInstruction(options) });
      const call = () =>
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

      let response: Response;
      try {
        response = await call();
        if (RETRY_STATUSES.has(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          response = await call();
        }
      } catch (err) {
        throw new GeminiTtsError(
          "api",
          `הבקשה להקראה של Gemini לא הסתיימה (${err instanceof Error ? err.name : "שגיאת רשת"}). נסו שוב.`,
        );
      }

      const json = (await response.json().catch(() => null)) as InteractionResponse | null;
      if (!response.ok) throw geminiTtsErrorFor(response.status, json);
      const audio = json ? findAudio(json) : undefined;
      if (!audio) throw new GeminiTtsError("no_audio", "Gemini לא החזיר שמע להקראה. נסו שוב.");

      const { wav, durationSeconds } = audioToWav(audio.data, audio.mime_type);
      return {
        audio: wav,
        contentType: "audio/wav",
        wordTimings: estimateWordTimings(text, durationSeconds),
        durationSeconds,
        isMock: false,
        ...(json?.usage
          ? { usage: { inputTokens: json.usage.total_input_tokens, outputTokens: json.usage.total_output_tokens } }
          : {}),
      };
    },
  };
}
