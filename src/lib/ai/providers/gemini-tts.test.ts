import { afterEach, describe, expect, it, vi } from "vitest";
import { NARRATION_STYLES } from "../../generation/presets";
import { splitWords } from "../../hebrew";
import {
  audioToWav,
  buildGeminiTtsBody,
  buildStyleInstruction,
  createGeminiTtsProvider,
  estimateWordTimings,
  geminiTtsErrorFor,
  pcmToWav,
} from "./gemini-tts";

const TEXT = "שָׁלוֹם יְלָדִים, הָיָה הָיָה סִפּוּר.\nוְהוּא מַתְחִיל עַכְשָׁיו!";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildGeminiTtsBody", () => {
  it("keeps the spoken text exactly and puts the style in speech_metadata", () => {
    const style = buildStyleInstruction({ style: "calm-bedtime", notes: "בלחש בסוף" });
    const body = buildGeminiTtsBody(TEXT, { model: "gemini-3.8-flash-tts", voice: "Sulafat", style }) as {
      input: { content: { text: string; annotations?: { type: string; style: string }[] }[] }[];
      generation_config: unknown;
      response_format: unknown;
    };
    const part = body.input[0].content[0];
    expect(part.text).toBe(TEXT);
    expect(part.annotations).toEqual([{ type: "speech_metadata", style }]);
    expect(style).toContain(NARRATION_STYLES.find((s) => s.slug === "calm-bedtime")!.prompt);
    expect(style).toContain("בלחש בסוף");
    expect(body.generation_config).toEqual({ speech_config: [{ voice: "Sulafat" }] });
    expect(body.response_format).toMatchObject({ type: "audio", mime_type: "audio/l16", sample_rate: 24000 });
  });

  it("sends no annotation when there is no style", () => {
    const body = buildGeminiTtsBody("שלום", { model: "m", voice: "Puck", style: "" }) as {
      input: { content: Record<string, unknown>[] }[];
    };
    expect(body.input[0].content[0]).toEqual({ type: "text", text: "שלום" });
  });
});

describe("buildStyleInstruction", () => {
  it("has a prompt for every narration style and honours free-text notes", () => {
    for (const style of NARRATION_STYLES) {
      expect(style.prompt.length).toBeGreaterThan(10);
      expect(buildStyleInstruction({ style: style.slug })).toContain(style.prompt);
    }
    expect(buildStyleInstruction({ notes: " לאט  ובעדינות " })).toContain("לאט ובעדינות");
    expect(buildStyleInstruction({ style: "unknown-slug" })).toBe("");
    expect(buildStyleInstruction(undefined)).toBe("");
  });
});

describe("pcmToWav", () => {
  it("writes a correct 44-byte header for 24 kHz 16-bit mono", () => {
    const pcm = new Uint8Array(48_000); // 1 second
    const wav = pcmToWav(pcm, 24_000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
    expect(wav.byteLength).toBe(44 + 48_000);
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint32(4, true)).toBe(36 + 48_000);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(48_000);
  });

  it("converts base64 PCM and passes an existing WAV through", () => {
    const pcm = Buffer.alloc(24_000).toString("base64"); // 0.5 s
    const converted = audioToWav(pcm, "audio/l16; rate=24000; channels=1");
    expect(converted.durationSeconds).toBeCloseTo(0.5, 5);
    expect(converted.wav.byteLength).toBe(44 + 24_000);
    const again = audioToWav(Buffer.from(converted.wav).toString("base64"), "audio/wav");
    expect(again.wav.byteLength).toBe(converted.wav.byteLength);
    expect(again.durationSeconds).toBeCloseTo(0.5, 5);
  });
});

describe("estimateWordTimings", () => {
  it("returns one timing per splitWords token that fills the duration", () => {
    const timings = estimateWordTimings(TEXT, 9.5);
    const words = splitWords(TEXT);
    expect(timings).toHaveLength(words.length);
    expect(timings.map((t) => t.word)).toEqual(words);
    expect(timings[0].start).toBe(0);
    expect(timings.at(-1)!.end).toBeCloseTo(9.5, 3);
    for (let i = 0; i < timings.length; i++) {
      expect(timings[i].end).toBeGreaterThan(timings[i].start);
      if (i > 0) expect(timings[i].start).toBeGreaterThanOrEqual(timings[i - 1].end);
    }
  });

  it("gives longer words more time and leaves a gap after a full stop", () => {
    const [short, long] = estimateWordTimings("א אבגדהוזח", 10);
    expect(long.end - long.start).toBeGreaterThan(short.end - short.start);
    const t = estimateWordTimings("שלום. עולם", 10);
    expect(t[1].start - t[0].end).toBeGreaterThan(0.5);
  });

  it("handles empty text", () => {
    expect(estimateWordTimings("  ", 3)).toEqual([]);
  });
});

describe("errors and requests", () => {
  it("maps statuses to Hebrew messages", () => {
    expect(geminiTtsErrorFor(429, null).kind).toBe("quota");
    expect(geminiTtsErrorFor(429, null).message).toMatch(/מכסת ההקראה/);
    expect(geminiTtsErrorFor(400, { error: { status: "RESOURCE_EXHAUSTED" } }).kind).toBe("quota");
    expect(geminiTtsErrorFor(402, null).kind).toBe("billing");
    expect(geminiTtsErrorFor(403, null).kind).toBe("auth");
    expect(geminiTtsErrorFor(500, null).kind).toBe("api");
  });

  it("synthesizes with a mocked fetch, retrying once on 503", async () => {
    vi.stubEnv("TTS_PROVIDER", "gemini");
    vi.stubEnv("TTS_API_KEY", "tts-key");
    vi.stubEnv("IMAGE_API_KEY", "image-key");
    vi.stubEnv("TTS_VOICE", "");
    vi.useFakeTimers();
    const audio = Buffer.alloc(48_000).toString("base64");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ steps: [{ content: [{ type: "audio", data: audio, mime_type: "audio/l16; rate=24000" }] }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await createGeminiTtsProvider();
    const promise = provider.synthesize("שלום עולם", { style: "warm-storyteller", voice: "Puck" });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("tts-key");
    expect(JSON.parse(init.body as string).generation_config.speech_config[0].voice).toBe("Puck");
    expect(result.contentType).toBe("audio/wav");
    expect(result.durationSeconds).toBeCloseTo(1, 5);
    expect(result.wordTimings).toHaveLength(2);
    expect(result.isMock).toBe(false);
  });

  it("reports quota exhaustion in Hebrew", async () => {
    vi.stubEnv("TTS_API_KEY", "k");
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const provider = await createGeminiTtsProvider();
    const promise = provider.synthesize("שלום").catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const error = (await promise) as Error;
    vi.useRealTimers();
    expect(error.message).toMatch(/מכסת ההקראה/);
  });
});
