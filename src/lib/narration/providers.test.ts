/**
 * The real providers against a stubbed fetch. The response fixtures follow the
 * shapes documented in the provider files; no network call is made here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { assembleDictaText, chunkText, createDictaNikudProvider } from "../ai/providers/dicta-nikud";
import { createTtsProvider } from "../ai/providers/tts";
import { splitWords } from "../hebrew";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Dicta nikud provider", () => {
  // Trimmed copy of a real response for: שלום ילדים! בית־ספר 2
  const dictaTokens = [
    { str: "שלום", sep: false, nakdan: { word: "שלום", options: [{ w: "שָׁלוֹם" }, { w: "שְׁלוֹם" }] } },
    { str: " ", sep: true, nakdan: { word: " ", options: [] } },
    { str: "שילדים", sep: false, nakdan: { word: "שילדים", options: [{ w: "שֶׁ|יְּלָדִים" }] } },
    { str: "! ", sep: true, nakdan: { word: "! ", options: [] } },
    { str: "בית", sep: false, nakdan: { word: "בית", options: [{ w: "בֵּית" }] } },
    { str: "־", sep: true, nakdan: { word: "־", options: [] } },
    { str: "ספר", sep: false, nakdan: { word: "ספר", options: [{ w: "סֵפֶר" }] } },
    { str: " ", sep: true, nakdan: { word: " ", options: [] } },
    { str: "2", sep: true, nakdan: { word: "2", options: [] } },
  ];

  it("joins the first option of each word, drops the prefix marker and keeps separators", () => {
    expect(assembleDictaText(dictaTokens)).toBe("שָׁלוֹם שֶׁיְּלָדִים! בֵּית־סֵפֶר 2");
  });

  it("copies a word that has no vocalization options", () => {
    expect(assembleDictaText([{ str: "abc", sep: false, nakdan: { word: "abc", options: [] } }])).toBe("abc");
  });

  it("posts the verified request and returns vocalized text", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: dictaTokens }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DICTA_API_URL", "");

    const provider = await createDictaNikudProvider();
    const input = "שלום שילדים! בית־ספר 2";
    const result = await provider.addNikud(input);
    expect(result).toEqual({ text: "שָׁלוֹם שֶׁיְּלָדִים! בֵּית־סֵפֶר 2", isMock: false });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nakdan-u2-1a.loadbalancer.dicta.org.il/api");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      task: "nakdan",
      data: input,
      genre: "modern",
      useTokenization: true,
    });
  });

  it("does not call the service for text without Hebrew letters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = await createDictaNikudProvider();
    expect(await provider.addNikud("123 abc")).toEqual({ text: "123 abc", isMock: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws instead of returning text with a different word count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: dictaTokens.slice(0, 1) })),
    );
    const provider = await createDictaNikudProvider();
    await expect(provider.addNikud("שלום ילדים")).rejects.toThrow(/words/);
  });

  it("throws on an HTTP error and on an unexpected body", async () => {
    const provider = await createDictaNikudProvider();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(provider.addNikud("שלום")).rejects.toThrow(/HTTP 503/);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ nope: true })));
    await expect(provider.addNikud("שלום")).rejects.toThrow(/unexpected shape/);
  });

  it("splits long text without cutting words and loses nothing", () => {
    const text = Array.from({ length: 60 }, (_, i) => `משפט מספר ${i} בסיפור.`).join(" ");
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join("")).toBe(text);
    expect(chunks.flatMap((chunk) => splitWords(chunk))).toEqual(splitWords(text));
  });
});

describe("ElevenLabs TTS provider", () => {
  function configure(extra: Record<string, string> = {}) {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    vi.stubEnv("TTS_API_KEY", "test-key");
    vi.stubEnv("TTS_VOICE", "voice123");
    vi.stubEnv("TTS_MODEL", "");
    vi.stubEnv("TTS_OUTPUT_FORMAT", "");
    vi.stubEnv("TTS_REGION", "");
    vi.stubEnv("TTS_STRIP_NIKUD", "");
    for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
  }

  function elevenLabsBody(spoken: string) {
    const characters = Array.from(spoken);
    return {
      audio_base64: Buffer.from("fake-mp3-bytes").toString("base64"),
      alignment: {
        characters,
        character_start_times_seconds: characters.map((_, i) => i * 0.1),
        character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.1),
      },
      normalized_alignment: null,
    };
  }

  it("calls with-timestamps and converts character times to word timings", async () => {
    configure();
    const text = "גַּן יָרֹק, יָפֶה!";
    const fetchMock = vi.fn(async () => jsonResponse(elevenLabsBody(text)));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await createTtsProvider();
    expect(provider).toMatchObject({ name: "elevenlabs", isMock: false });
    const result = await provider.synthesize(text, { speed: 0.9 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice123/with-timestamps?output_format=mp3_44100_128",
    );
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string)).toEqual({
      text,
      model_id: "eleven_v3",
      language_code: "he",
      voice_settings: { speed: 0.9 },
    });

    expect(result.isMock).toBe(false);
    expect(result.contentType).toBe("audio/mpeg");
    expect(new TextDecoder().decode(result.audio)).toBe("fake-mp3-bytes");
    expect(result.wordTimings.map((t) => t.word)).toEqual(splitWords(text));
    expect(result.durationSeconds).toBeCloseTo(Array.from(text).length * 0.1, 5);
  });

  it("can send the text without nikud and still time the vocalized words", async () => {
    configure({ TTS_STRIP_NIKUD: "1", TTS_REGION: "eu", TTS_MODEL: "eleven_multilingual_v2", TTS_OUTPUT_FORMAT: "wav_22050" });
    const fetchMock = vi.fn(async () => jsonResponse(elevenLabsBody("גן ירק")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await (await createTtsProvider()).synthesize("גַּן יָרֹק", { voice: "other" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.eu.residency.elevenlabs.io/v1/text-to-speech/other/with-timestamps?output_format=wav_22050",
    );
    // language_code is documented as unsupported on multilingual_v2, so it is left out.
    expect(JSON.parse(init.body as string)).toEqual({ text: "גן ירק", model_id: "eleven_multilingual_v2" });
    expect(result.contentType).toBe("audio/wav");
    expect(result.wordTimings).toEqual([
      { word: "גַּן", start: 0, end: 0.2 },
      { word: "יָרֹק", start: 0.3, end: 0.6 },
    ]);
  });

  it("fails loudly on configuration and vendor errors", async () => {
    configure({ TTS_PROVIDER: "azure" });
    await expect(createTtsProvider()).rejects.toThrow(/not implemented/);

    configure({ TTS_API_KEY: "" });
    await expect(createTtsProvider()).rejects.toThrow(/TTS_API_KEY/);

    configure({ TTS_OUTPUT_FORMAT: "pcm_16000" });
    await expect(createTtsProvider()).rejects.toThrow(/not supported/);

    configure({ TTS_VOICE: "" });
    await expect((await createTtsProvider()).synthesize("שלום")).rejects.toThrow(/TTS_VOICE/);

    configure();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail: "quota" }, 401)));
    await expect((await createTtsProvider()).synthesize("שלום")).rejects.toThrow(/HTTP 401/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ audio_base64: "AAAA", alignment: null })),
    );
    await expect((await createTtsProvider()).synthesize("שלום")).rejects.toThrow(/no character alignment/);
  });
});
