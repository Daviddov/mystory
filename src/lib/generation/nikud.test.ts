import { describe, expect, it } from "vitest";
import type { NikudProvider, TextRequest } from "../ai/types";
import { vocalizeStory } from "./nikud";

const VOCALIZED: Record<string, string> = { "שלום ילד": "שָׁלֹום יֶלֶד", "בוקר טוב": "בּוֹקֶר טוֹב" };
const nikud: NikudProvider = {
  name: "gemini",
  isMock: false,
  addNikud: async (text) => {
    if (!VOCALIZED[text]) throw new Error("down");
    return { text: VOCALIZED[text], isMock: false };
  },
};

function askReturning(pages: { page: number; text: string }[]) {
  return async <T>(request: TextRequest<T>): Promise<T> => request.schema.parse({ pages });
}

describe("vocalizeStory", () => {
  it("keeps a proofreader's correction of vowel points only", async () => {
    const result = await vocalizeStory(
      {
        nikud,
        ask: askReturning([
          { page: 1, text: "שָׁלוֹם יֶלֶד" },
          { page: 2, text: "בּוֹקֶר טוֹבִים" },
        ]),
      },
      ["שלום ילד", "בוקר טוב"],
    );
    expect(result.texts).toEqual(["שָׁלוֹם יֶלֶד", "בּוֹקֶר טוֹב"]);
    expect(result.corrected).toBe(1);
    expect(result.missing).toBe(0);
  });

  it("leaves a page without nikud when vocalizing it failed and the proofreader did not fix it", async () => {
    const result = await vocalizeStory({ nikud, log: () => {} }, ["שלום ילד", "לילה"]);
    expect(result.texts).toEqual(["שָׁלֹום יֶלֶד", undefined]);
    expect(result.missing).toBe(1);
  });

  it("does nothing with the mock provider", async () => {
    const result = await vocalizeStory({ nikud: { ...nikud, isMock: true } }, ["שלום"]);
    expect(result.texts).toEqual([undefined]);
  });
});
