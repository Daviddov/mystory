import { describe, expect, it } from "vitest";
import { VEO_PRICE_PER_SECOND_720P } from "../ai/providers/video";
import {
  PRICE_TABLE,
  buildCostContext,
  costDescription,
  costLine,
  estimateAnimation,
  estimateHero,
  estimateNarration,
  estimateNikud,
  estimatePictures,
  estimateStory,
  estimateStyle,
  formatUsdIls,
  gridCalls,
  sumEstimates,
  totalLine,
  type CostStatusInput,
} from "./costs";

const real = (name: string) => ({ name, isMock: false });
const mock = { name: "mock", isMock: true };
const REAL: CostStatusInput = {
  text: real("gemini"),
  nikud: real("dicta"),
  tts: real("gemini"),
  image: real("gemini"),
  video: real("gemini"),
};
const MOCK: CostStatusInput = { text: mock, nikud: mock, tts: mock, image: mock, video: mock };
const NOW = new Date("2026-10-19T00:00:00Z");

describe("price table", () => {
  it("Veo prices match the provider table", () => {
    expect(PRICE_TABLE.veoPerSecond720p).toEqual(VEO_PRICE_PER_SECOND_720P);
  });
  it("switches Google prices on 2027-01-01", () => {
    const before = buildCostContext(REAL, {}, NOW);
    const after = buildCostContext(REAL, {}, new Date("2027-01-02T00:00:00Z"));
    expect(before.text.inPerM).toBe(0.75);
    expect(after.text.inPerM).toBe(1.5);
    expect(after.tts.per1kChars).toBeGreaterThan(before.tts.per1kChars);
  });
});

describe("env overrides", () => {
  it("overrides every price and the exchange rate", () => {
    const ctx = buildCostContext(
      REAL,
      {
        COST_TEXT_IN_PER_M: "1",
        COST_TEXT_OUT_PER_M: "2",
        COST_IMAGE_USD: "0.5",
        COST_TTS_PER_1K_CHARS: "0.3",
        COST_VIDEO_PER_SECOND: "0.2",
        COST_USD_TO_ILS: "4",
      },
      NOW,
    );
    expect(ctx.text).toMatchObject({ inPerM: 1, outPerM: 2, confirmed: true });
    expect(ctx.image.perImage).toBe(0.5);
    expect(ctx.tts.per1kChars).toBe(0.3);
    expect(ctx.video.perSecond).toBe(0.2);
    expect(ctx.usdToIls).toBe(4);
  });
  it("ignores garbage and marks unknown models unconfirmed", () => {
    const ctx = buildCostContext(REAL, { COST_IMAGE_USD: "abc", IMAGE_MODEL: "mystery" }, NOW);
    expect(ctx.image.perImage).toBe(0.0336);
    expect(ctx.image.confirmed).toBe(false);
    expect(ctx.usdToIls).toBe(3.7);
  });
  it("uses ElevenLabs per-character pricing", () => {
    expect(buildCostContext({ ...REAL, tts: real("elevenlabs") }, {}, NOW).tts.per1kChars).toBe(0.08);
    expect(buildCostContext({ ...REAL, tts: real("elevenlabs") }, { TTS_MODEL: "eleven_flash_v2_5" }, NOW).tts.per1kChars).toBe(0.04);
  });
});

describe("estimates", () => {
  const ctx = buildCostContext(REAL, {}, NOW);

  it("counts grid calls", () => {
    expect(gridCalls(12, "3x3")).toBe(2);
    expect(gridCalls(12, "4x4")).toBe(1);
    expect(gridCalls(0, "3x3")).toBe(0);
    expect(gridCalls(17, "4x4")).toBe(2);
  });

  it("pictures: grid calls times the image price plus one text call", () => {
    const a = estimatePictures(ctx, { missingPages: 12, layout: "3x3", textChars: 2400 });
    const b = estimatePictures(ctx, { missingPages: 12, layout: "4x4", textChars: 2400 });
    expect(a.usd - b.usd).toBeCloseTo(ctx.image.perImage, 6);
    expect(a.usd).toBeGreaterThan(2 * ctx.image.perImage);
    expect(a.covers).toContain("2 תמונות רשת");
    expect(estimatePictures(ctx, { missingPages: 0, layout: "3x3", textChars: 0 }).usd).toBe(0);
  });

  it("narration scales with characters", () => {
    const ten = estimateNarration(ctx, { chars: 1000 });
    expect(ten.usd).toBeCloseTo(ctx.tts.per1kChars, 8);
    expect(estimateNarration(ctx, { chars: 3000 }).usd).toBeCloseTo(3 * ten.usd, 8);
    const eleven = buildCostContext({ ...REAL, tts: real("elevenlabs") }, {}, NOW);
    expect(estimateNarration(eleven, { chars: 2500 }).usd).toBeCloseTo(0.2, 8);
  });

  it("animation is clips x seconds x price", () => {
    expect(estimateAnimation(ctx, { clips: 3 }).usd).toBeCloseTo(3 * 8 * 0.05, 8);
    expect(estimateAnimation(ctx, { clips: 2, seconds: 4 }).usd).toBeCloseTo(0.4, 8);
    expect(estimateAnimation(ctx, { clips: 0 }).usd).toBe(0);
  });

  it("style and nikud are free", () => {
    expect(estimateStyle().free).toBe(true);
    expect(estimateNikud(ctx)).toMatchObject({ usd: 0, free: true, mock: false });
  });

  it("story is four text calls; hero without a description also needs text", () => {
    expect(estimateStory(ctx).usd).toBeGreaterThan(0.03);
    const withDesc = estimateHero(ctx, { hasDescription: true, storyChars: 1000 });
    const without = estimateHero(ctx, { hasDescription: false, storyChars: 1000 });
    expect(withDesc.usd).toBeCloseTo(ctx.image.perImage, 8);
    expect(without.usd).toBeGreaterThan(withDesc.usd);
  });

  it("mock providers cost nothing and say so", () => {
    const m = buildCostContext(MOCK, {}, NOW);
    for (const e of [
      estimateStory(m),
      estimateHero(m, { hasDescription: false, storyChars: 100 }),
      estimatePictures(m, { missingPages: 5, layout: "3x3", textChars: 500 }),
      estimateNarration(m, { chars: 500 }),
      estimateNikud(m),
      estimateAnimation(m, { clips: 2 }),
    ]) {
      expect(e.mock).toBe(true);
      expect(costLine(e, m)).toBe("עלות משוערת: ללא עלות (מצב הדגמה)");
    }
    expect(totalLine(sumEstimates([estimateStory(m), estimateNikud(m)]), m)).toContain("מצב הדגמה");
  });
});

describe("formatting", () => {
  it("rounds sensibly", () => {
    expect(formatUsdIls(0.04, 3.7)).toBe("כ-$0.04 (כ-0.15 ₪)");
    expect(formatUsdIls(0.004, 3.7)).toBe("פחות מסנט");
  });
  it("describes retries and unconfirmed prices", () => {
    const ctx = buildCostContext(REAL, { IMAGE_MODEL: "mystery" }, NOW);
    const text = costDescription(estimatePictures(ctx, { missingPages: 3, layout: "3x3", textChars: 300 }));
    expect(text).toContain("לא אומת");
    expect(text).toContain("ניסיונות חוזרים");
  });
  it("sums only what is still to do", () => {
    const ctx = buildCostContext(REAL, {}, NOW);
    const sum = sumEstimates([estimateAnimation(ctx, { clips: 1 }), estimateAnimation(ctx, { clips: 0 })]);
    expect(sum.usd).toBeCloseTo(0.4, 8);
  });
});
