/**
 * The real providers against a stubbed fetch. The response fixtures follow the
 * shapes documented in the provider files; no network call is made here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { assembleDictaText, chunkText, createDictaNikudProvider } from "../ai/providers/dicta-nikud";
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
