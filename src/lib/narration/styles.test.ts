import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVoiceSettings, createTtsProvider, dropAlignmentPrefix } from "../ai/providers/tts";
import { splitWords } from "../hebrew";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configure(model = "") {
  vi.stubEnv("TTS_PROVIDER", "elevenlabs");
  vi.stubEnv("TTS_API_KEY", "test-key");
  vi.stubEnv("TTS_VOICE", "voice123");
  vi.stubEnv("TTS_MODEL", model);
  vi.stubEnv("TTS_OUTPUT_FORMAT", "");
  vi.stubEnv("TTS_REGION", "");
  vi.stubEnv("TTS_STRIP_NIKUD", "");
}

/** Echoes the SENT text back as the alignment, like the real API. */
function echoFetch() {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const sent = JSON.parse(init!.body as string).text as string;
    const characters = Array.from(sent);
    return new Response(
      JSON.stringify({
        audio_base64: Buffer.from("x").toString("base64"),
        alignment: {
          characters,
          character_start_times_seconds: characters.map((_, i) => i * 0.1),
          character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.1),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}

describe("ElevenLabs narration styles", () => {
  it("maps a preset to voice_settings (stability snapped for v3, speed combined and clamped)", () => {
    expect(buildVoiceSettings({ style: "calm-bedtime", speed: 0.5 }, "eleven_v3")).toEqual({
      stability: 1,
      style: 0.1,
      similarity_boost: 0.8,
      speed: 0.7,
    });
    expect(buildVoiceSettings({ style: "warm-storyteller" }, "eleven_v4")).toMatchObject({ stability: 0.5, speed: 0.95 });
    expect(buildVoiceSettings({ style: "playful-rhymes" }, "eleven_v3")?.stability).toBe(0);
    expect(buildVoiceSettings({ style: "excited-adventure", speed: 2 }, "eleven_v4")?.speed).toBe(1.2);
    expect(buildVoiceSettings({ style: "unknown" }, "eleven_v3")).toBeUndefined();
    expect(buildVoiceSettings({ speed: 0.9 }, "eleven_v3")).toEqual({ speed: 0.9 });
  });

  it("prepends the audio tag on eleven_v3 and keeps word timings matching the original text", async () => {
    configure();
    const text = "גַּן יָרֹק, יָפֶה!";
    const fetchMock = echoFetch();
    vi.stubGlobal("fetch", fetchMock);
    const provider = await createTtsProvider();
    const result = await provider.synthesize(text, { style: "gentle-whisper", notes: "like a secret" });

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.text).toBe(`[whispers] ${text}`);
    expect(sent.voice_settings).toMatchObject({ stability: 0.5, style: 0.2, speed: 0.9 });
    expect(JSON.stringify(sent)).not.toContain("secret");
    expect(result.wordTimings.map((t) => t.word)).toEqual(splitWords(text));
    // the first word starts after the 10 tag characters ("[whispers] ")
    expect(result.wordTimings[0].start).toBeCloseTo(1.1, 5);
  });

  it("sends no tag to models that do not understand tags", async () => {
    configure("eleven_v4");
    const fetchMock = echoFetch();
    vi.stubGlobal("fetch", fetchMock);
    const provider = await createTtsProvider();
    const result = await provider.synthesize("גן ירק", { style: "gentle-whisper" });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).text).toBe("גן ירק");
    expect(result.wordTimings.map((t) => t.word)).toEqual(["גן", "ירק"]);
  });

  it("dropAlignmentPrefix removes exactly the prefix characters", () => {
    const alignment = {
      characters: ["[", "a", "]", " ", "x", "y"],
      startTimes: [0, 1, 2, 3, 4, 5],
      endTimes: [1, 2, 3, 4, 5, 6],
    };
    expect(dropAlignmentPrefix(alignment, "[a] ")).toEqual({ characters: ["x", "y"], startTimes: [4, 5], endTimes: [5, 6] });
  });
});
