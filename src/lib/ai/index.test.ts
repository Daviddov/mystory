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
