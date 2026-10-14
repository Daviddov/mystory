import { describe, expect, it } from "vitest";
import { THEME_SLUGS } from "../taxonomy";
import { WizardInputSchema } from "./input";
import { STORY_STYLE_SLUGS } from "./options";
import { PARASHA_SEEDS, getParashaSeed } from "./parasha";

describe("PARASHA_SEEDS", () => {
  it("has the 54 parashot once each, in the order of the cycle", () => {
    expect(PARASHA_SEEDS).toHaveLength(54);
    expect(new Set(PARASHA_SEEDS.map((seed) => seed.slug)).size).toBe(54);
    expect(PARASHA_SEEDS[0].name).toBe("בראשית");
    expect(PARASHA_SEEDS[53].name).toBe("וזאת הברכה");
    expect(getParashaSeed("noach")?.name).toBe("נח");
  });

  it("every seed is a valid wizard input in the parasha category", () => {
    for (const seed of PARASHA_SEEDS) {
      for (const theme of seed.themes) expect(THEME_SLUGS, `${seed.slug}: ${theme}`).toContain(theme);
      const parsed = WizardInputSchema.safeParse({
        childName: seed.hero.name,
        childGender: seed.hero.gender,
        appearance: seed.hero.appearance,
        idea: seed.idea,
        ageGroup: seed.ageGroup,
        category: "parasha",
        style: STORY_STYLE_SLUGS[0],
      });
      expect(parsed.success, `${seed.slug}: ${parsed.error?.message}`).toBe(true);
    }
  });
});
