import { describe, expect, it } from "vitest";
import { mockTextProvider } from "../ai/mock";
import type { TextProvider, TextRequest } from "../ai/types";
import { SEUSS_PRINCIPLES } from "../generation/seuss";
import { writeStory, WriteStoryError } from "./write";

describe("writeStory (the studio's story stage)", () => {
  it("writes pages with the sample writer and says so", async () => {
    const story = await writeStory({ text: mockTextProvider }, { idea: "ארנבת שלא רוצה ללכת לגן", ageGroup: "3-5" });
    expect(story.pages.length).toBeGreaterThanOrEqual(3);
    expect(story.pages.every((page) => page.text.trim().length > 0)).toBe(true);
    expect(story.isMock).toBe(true);
  });

  it("puts the Dr. Seuss principles in the writing prompts, whatever the idea", async () => {
    const systems: string[] = [];
    const spy: TextProvider = {
      name: "spy",
      isMock: true,
      generate: <T,>(request: TextRequest<T>) => {
        systems.push(request.system ?? "");
        return mockTextProvider.generate(request);
      },
    };
    await writeStory({ text: spy }, { idea: "מסע לחלל", ageGroup: "6-8" });
    const writing = systems.filter((system) => system.includes("write like Dr. Seuss"));
    expect(writing.length).toBeGreaterThanOrEqual(2); // outline and pages
    expect(SEUSS_PRINCIPLES).toContain("refrain");
  });

  it("refuses a story that stays unacceptable after one revision", async () => {
    const failing: TextProvider = {
      name: "failing",
      isMock: false,
      generate: async <T,>(request: TextRequest<T>) => {
        const name = request.schemaName;
        const data =
          name === "story_review"
            ? { verdict: "major", issues: [{ page: 0, description: "unsafe" }] }
            : (await mockTextProvider.generate(request)).data;
        return { data: data as T, isMock: false };
      },
    };
    await expect(writeStory({ text: failing }, { idea: "סיפור", ageGroup: "3-5" })).rejects.toBeInstanceOf(WriteStoryError);
  });
});
