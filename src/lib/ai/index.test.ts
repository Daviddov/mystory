import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiStatus, getTtsProvider, ttsHonoursNotes } from "./index";

afterEach(() => vi.unstubAllEnvs());

describe("TTS provider selection", () => {
  it("defaults to the mock when TTS_PROVIDER is unset", async () => {
    vi.stubEnv("TTS_PROVIDER", "");
    expect(getAiStatus().tts).toEqual({ name: "mock", isMock: true });
    expect(ttsHonoursNotes()).toBe(false);
    expect((await getTtsProvider()).isMock).toBe(true);
  });

  it("treats gemini as a first-class value that uses free-text notes", async () => {
    vi.stubEnv("TTS_PROVIDER", "gemini");
    vi.stubEnv("TTS_API_KEY", "k");
    expect(getAiStatus().tts).toEqual({ name: "gemini", isMock: false });
    expect(ttsHonoursNotes()).toBe(true);
    const provider = await getTtsProvider();
    expect(provider.name).toBe("gemini");
    expect(provider.isMock).toBe(false);
  });

  it("keeps ElevenLabs selectable and ignoring notes", () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    expect(getAiStatus().tts).toEqual({ name: "elevenlabs", isMock: false });
    expect(ttsHonoursNotes()).toBe(false);
  });
});

describe("provider defaults from keys", () => {
  it("a key alone turns on Gemini images, voice and video", () => {
    vi.stubEnv("IMAGE_PROVIDER", "");
    vi.stubEnv("IMAGE_API_KEY", "k");
    vi.stubEnv("TTS_PROVIDER", "");
    vi.stubEnv("TTS_API_KEY", "k");
    vi.stubEnv("VIDEO_PROVIDER", "");
    vi.stubEnv("VIDEO_API_KEY", "k");
    const status = getAiStatus();
    expect(status.image).toEqual({ name: "gemini", isMock: false });
    expect(status.tts).toEqual({ name: "gemini", isMock: false });
    expect(status.video).toEqual({ name: "gemini", isMock: false });
  });

  it("an ElevenLabs key alone means ElevenLabs", () => {
    vi.stubEnv("TTS_PROVIDER", "");
    vi.stubEnv("TTS_API_KEY", "sk_abc");
    expect(getAiStatus().tts.name).toBe("elevenlabs");
  });

  it("nikud uses Gemini when a Gemini key exists, Dicta when asked, the mock otherwise", () => {
    vi.stubEnv("NIKUD_PROVIDER", "");
    vi.stubEnv("TEXT_API_KEY", "k");
    expect(getAiStatus().nikud).toEqual({ name: "gemini", isMock: false });
    vi.stubEnv("NIKUD_PROVIDER", "dicta");
    expect(getAiStatus().nikud).toEqual({ name: "dicta", isMock: false });
    vi.stubEnv("NIKUD_PROVIDER", "gemini");
    vi.stubEnv("TEXT_API_KEY", "");
    expect(getAiStatus().nikud).toEqual({ name: "dicta", isMock: false });
    vi.stubEnv("NIKUD_PROVIDER", "");
    expect(getAiStatus().nikud).toEqual({ name: "mock", isMock: true });
  });
});
