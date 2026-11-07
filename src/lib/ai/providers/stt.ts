/**
 * Speech to text with word timestamps, for timing recordings that have none
 * (scripts/align-recordings.ts). Server side only: it reads local audio files.
 * Selected with STT_PROVIDER; there is no mock (nothing is timed without it).
 *
 * Environment:
 *   STT_PROVIDER  "whisper"     faster-whisper on this machine (scripts/stt/transcribe.py)
 *   STT_MODEL     a CTranslate2 Whisper model, default "ivrit-ai/whisper-large-v3-turbo-ct2"
 *   STT_PYTHON    the Python that has faster-whisper, default "python"
 *                 (may carry arguments, e.g. "py -3.12")
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
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

export function createSttProvider(): SttProvider {
  const vendor = (env("STT_PROVIDER") ?? "").toLowerCase();
  if (vendor === "whisper") return whisperProvider();
  throw new SttProviderError(
    vendor ? `STT_PROVIDER "${vendor}" is not implemented. Use "whisper".` : `STT_PROVIDER is not set ("whisper")`,
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
