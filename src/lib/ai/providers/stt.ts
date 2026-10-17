/**
 * Speech to text with word timestamps, for timing recordings that have none
 * (scripts/align-recordings.ts). Server side only: it reads local audio files.
 * Selected with STT_PROVIDER; there is no mock (nothing is timed without it).
 *
 * Environment:
 *   STT_PROVIDER  "whisper"     faster-whisper on this machine (scripts/stt/transcribe.py)
 *                 "elevenlabs"  ElevenLabs Scribe
 *   STT_MODEL     whisper: a CTranslate2 Whisper model, default "ivrit-ai/whisper-large-v3-turbo-ct2"
 *                 elevenlabs: default "scribe_v2"
 *   STT_PYTHON    whisper: the Python that has faster-whisper, default "python"
 *                 (may carry arguments, e.g. "py -3.12")
 *   STT_API_KEY   elevenlabs: API key; defaults to TTS_API_KEY
 *
 * ElevenLabs VERIFIED against the API reference on 2026-10-17
 * (https://elevenlabs.io/docs/api-reference/speech-to-text/convert):
 *
 *   POST https://api.elevenlabs.io/v1/speech-to-text   (multipart/form-data)
 *   headers: xi-api-key
 *   form:    model_id, file, language_code ("he" / "heb"), timestamps_granularity ("word")
 *   200:     { language_code, text, words: [{ text, type: "word" | "spacing" | "audio_event",
 *              start, end, ... }] }
 *
 * NOT VERIFIED: a real Scribe request has never been made from this code (the
 * quota was exhausted). The whisper path was run on the library's recordings.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { aiEnv } from "../../config";
import type { RecognizedWord } from "../../narration/recognized";

export interface SttFile {
  /** Local path of the audio file. */
  path: string;
  contentType?: string;
}

export interface SttProvider {
  readonly name: string;
  /** One word list per file, in order; null when that file could not be transcribed. */
  transcribe(files: readonly SttFile[]): Promise<(RecognizedWord[] | null)[]>;
}

export class SttProviderError extends Error {
  constructor(message: string) {
    super(`STT: ${message}`);
    this.name = "SttProviderError";
  }
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

const DEFAULT_WHISPER_MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2";
const DEFAULT_SCRIBE_MODEL = "scribe_v2";
const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const REQUEST_TIMEOUT_MS = 180_000;

export function createSttProvider(): SttProvider {
  const vendor = (env("STT_PROVIDER") ?? "").toLowerCase();
  if (vendor === "whisper") return whisperProvider();
  if (vendor === "elevenlabs") return scribeProvider();
  throw new SttProviderError(
    vendor ? `STT_PROVIDER "${vendor}" is not implemented. Use "whisper" or "elevenlabs".` : `STT_PROVIDER is not set ("whisper" or "elevenlabs")`,
  );
}

// --- Local faster-whisper -------------------------------------------------------

const WhisperOutputSchema = z.array(
  z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).nullable(),
);

function whisperProvider(): SttProvider {
  const model = env("STT_MODEL") ?? DEFAULT_WHISPER_MODEL;
  const [python, ...pythonArgs] = (env("STT_PYTHON") ?? "python").split(/\s+/);
  const script = path.join(process.cwd(), "scripts", "stt", "transcribe.py");
  return {
    name: `whisper:${model}`,
    async transcribe(files) {
      if (files.length === 0) return [];
      const dir = mkdtempSync(path.join(os.tmpdir(), "stt-"));
      try {
        const input = path.join(dir, "in.json");
        const output = path.join(dir, "out.json");
        writeFileSync(input, JSON.stringify(files.map((file) => path.resolve(file.path))));
        await new Promise<void>((resolve, reject) => {
          // Progress goes to stderr, which is passed through.
          const child = spawn(python, [...pythonArgs, "-I", script, model, input, output], {
            stdio: ["ignore", "inherit", "inherit"],
          });
          child.on("error", (error) => reject(new SttProviderError(`cannot run ${python}: ${error.message}`)));
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new SttProviderError(`transcribe.py exited with code ${code}`)),
          );
        });
        const parsed = WhisperOutputSchema.parse(JSON.parse(readFileSync(output, "utf8")));
        if (parsed.length !== files.length) throw new SttProviderError("transcribe.py returned the wrong number of results");
        return parsed;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

// --- ElevenLabs Scribe ----------------------------------------------------------

const ScribeResponseSchema = z.object({
  words: z.array(
    z.object({
      text: z.string(),
      type: z.string(),
      start: z.number().nullish(),
      end: z.number().nullish(),
    }),
  ),
});

function scribeProvider(): SttProvider {
  const apiKey = env("STT_API_KEY") ?? aiEnv.ttsApiKey();
  if (!apiKey) throw new SttProviderError("STT_API_KEY (or TTS_API_KEY) is not set");
  const model = env("STT_MODEL") ?? DEFAULT_SCRIBE_MODEL;

  async function one(file: SttFile): Promise<RecognizedWord[] | null> {
    const form = new FormData();
    form.set("model_id", model);
    form.set("language_code", "he");
    form.set("timestamps_granularity", "word");
    form.set("tag_audio_events", "false");
    form.set(
      "file",
      new Blob([readFileSync(file.path)], { type: file.contentType ?? "application/octet-stream" }),
      path.basename(file.path),
    );
    const response = await fetch(SCRIBE_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey as string },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      // Out of quota, bad key...: every further request would fail the same way.
      if (response.status === 401 || response.status === 402 || response.status === 429) {
        throw new SttProviderError(`ElevenLabs answered ${response.status}: ${detail}`);
      }
      console.warn(`STT: ElevenLabs answered ${response.status} for ${file.path}: ${detail}`);
      return null;
    }
    const body = ScribeResponseSchema.parse(await response.json());
    return body.words
      .filter((w) => w.type === "word" && w.start != null && w.end != null && w.text.trim() !== "")
      .map((w) => ({ word: w.text.trim(), start: w.start as number, end: w.end as number }));
  }

  return {
    name: `elevenlabs:${model}`,
    async transcribe(files) {
      const results: (RecognizedWord[] | null)[] = [];
      for (const file of files) results.push(await one(file));
      return results;
    },
  };
}
