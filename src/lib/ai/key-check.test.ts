import { afterEach, describe, expect, it, vi } from "vitest";
import { checkApiKeys } from "./key-check";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("checkApiKeys", () => {
  it("reports ok, invalid, quota and missing per key, and never returns a key", async () => {
    vi.stubEnv("TEXT_API_KEY", "good-key");
    vi.stubEnv("IMAGE_API_KEY", "bad-key");
    vi.stubEnv("TTS_API_KEY", "busy-key");
    vi.stubEnv("VIDEO_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "claude-key");
    const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      const key = init.headers["x-goog-api-key"] ?? init.headers["x-api-key"];
      if (key === "bad-key") return Response.json({ error: { message: "API key not valid" } }, { status: 400 });
      if (key === "busy-key") return Response.json({ error: { message: "quota" } }, { status: 429 });
      return Response.json({ models: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await checkApiKeys();
    const state = Object.fromEntries(results.map((r) => [r.envVar, r.state]));
    expect(state).toEqual({
      TEXT_API_KEY: "ok",
      IMAGE_API_KEY: "invalid",
      TTS_API_KEY: "quota",
      VIDEO_API_KEY: "missing",
      ANTHROPIC_API_KEY: "ok",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(results)).not.toMatch(/good-key|bad-key|busy-key|claude-key/);
  });

  it("reports a network failure as an error", async () => {
    vi.stubEnv("TEXT_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const text = (await checkApiKeys()).find((r) => r.envVar === "TEXT_API_KEY");
    expect(text).toMatchObject({ state: "error", detail: "no connection" });
  });
});
