import { describe, expect, it } from "vitest";
import type { NikudProvider, TextProvider, TextRequest } from "../types";
import { createGeminiNikudProvider } from "./gemini-nikud";

function textReturning(answer: string | Error): TextProvider {
  return {
    name: "gemini",
    isMock: false,
    async generate<T>(request: TextRequest<T>) {
      if (answer instanceof Error) throw answer;
      return { data: request.schema.parse({ text: answer }), isMock: false, usage: { inputTokens: 10, outputTokens: 10 } };
    },
  } as TextProvider;
}

const dicta: NikudProvider = { name: "dicta", isMock: false, addNikud: async () => ({ text: "שָׁלוֹם יֶלֶד", isMock: false }) };
const silent = () => {};

describe("Gemini nikud", () => {
  it("returns Gemini's vocalization when only vowel points were added", async () => {
    const provider = await createGeminiNikudProvider({ text: textReturning("שָׁלוֹם יֶלֶד!"), fallback: dicta, log: silent });
    expect((await provider.addNikud("שלום ילד!")).text).toBe("שָׁלוֹם יֶלֶד!");
  });

  it("falls back to Dicta when Gemini changed a word", async () => {
    const provider = await createGeminiNikudProvider({ text: textReturning("שָׁלוֹם יַלְדָּה"), fallback: dicta, log: silent });
    expect((await provider.addNikud("שלום ילד")).text).toBe("שָׁלוֹם יֶלֶד");
  });

  it("falls back to Dicta when Gemini fails or returns no nikud", async () => {
    for (const answer of [new Error("503"), "שלום ילד"]) {
      const provider = await createGeminiNikudProvider({ text: textReturning(answer), fallback: dicta, log: silent });
      expect((await provider.addNikud("שלום ילד")).text).toBe("שָׁלוֹם יֶלֶד");
    }
  });

  it("throws without a fallback", async () => {
    const provider = await createGeminiNikudProvider({ text: textReturning(new Error("x")), log: silent });
    await expect(provider.addNikud("שלום")).rejects.toThrow();
  });
});
