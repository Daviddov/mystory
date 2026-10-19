import { describe, expect, it } from "vitest";
import {
  EXPECTED_SECONDS,
  PROGRESS_CAP,
  easedProgress,
  elapsedText,
  isOverdue,
  progressView,
  remainingText,
  toBusy,
  valueText,
} from "./progress";

describe("easedProgress", () => {
  it("starts at 0, rises monotonically and never reaches the cap", () => {
    expect(easedProgress(0, 30)).toBe(0);
    let last = 0;
    for (let t = 1; t <= 600; t += 7) {
      const p = easedProgress(t, 30);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThanOrEqual(PROGRESS_CAP);
      last = p;
    }
    expect(easedProgress(10_000, 30)).toBeLessThan(1);
  });
  it("is about 80% at the expected time", () => {
    expect(easedProgress(30, 30)).toBeGreaterThan(0.75);
    expect(easedProgress(30, 30)).toBeLessThan(0.85);
  });
  it("is 0 without an expectation", () => {
    expect(easedProgress(5, 0)).toBe(0);
  });
});

describe("progressView", () => {
  it("estimates by time for a single call and goes overdue honestly", () => {
    const busy = { label: "x", expectedSeconds: 30 };
    const early = progressView(busy, 6);
    expect(early.percent).toBeGreaterThan(0);
    expect(early.overdue).toBe(false);
    expect(early.remainingSeconds).toBe(24);
    const late = progressView(busy, 60);
    expect(late.overdue).toBe(true);
    expect(late.remainingSeconds).toBeNull();
    expect(late.percent).toBeLessThanOrEqual(92);
    expect(valueText(late)).toContain("לוקח יותר מהצפוי");
  });
  it("is determinate from done/total, never 100%", () => {
    const view = progressView({ label: "x", steps: { done: 2, total: 4 } }, 20);
    expect(view.percent).toBe(50);
    expect(view.remainingSeconds).toBe(20);
    expect(progressView({ label: "x", steps: { done: 4, total: 4 } }, 20).percent).toBe(99);
  });
  it("adds the running step's fraction when each step has an expectation", () => {
    const view = progressView({ label: "x", steps: { done: 0, total: 2 }, expectedSeconds: 10 }, 5, 5);
    expect(view.percent).toBeGreaterThan(0);
    expect(view.percent).toBeLessThan(50);
  });
  it("uses an explicit progress value", () => {
    expect(progressView({ label: "x", progress: 0.4 }, 1).percent).toBe(40);
  });
  it("is indeterminate with nothing known", () => {
    const view = progressView({ label: "x" }, 3);
    expect(view.value).toBeNull();
    expect(valueText(view)).toBe("בתהליך");
  });
});

describe("texts", () => {
  it("formats the remaining time in Hebrew", () => {
    expect(remainingText(3)).toBe("עוד כמה שניות");
    expect(remainingText(24)).toBe("נשארו בערך 25 שניות");
    expect(remainingText(150)).toBe("נשארו בערך 3 דקות");
  });
  it("formats the elapsed time", () => {
    expect(elapsedText(12.9)).toBe("עברו 12 שניות");
    expect(elapsedText(65)).toBe("עברו 1:05 דקות");
  });
  it("isOverdue needs an expectation", () => {
    expect(isOverdue(100, undefined)).toBe(false);
    expect(isOverdue(40, 30)).toBe(true);
  });
  it("normalizes plain labels", () => {
    expect(toBusy("hi")).toEqual({ label: "hi" });
    expect(toBusy(null)).toBeNull();
  });
  it("has a positive expectation for every operation", () => {
    for (const seconds of Object.values(EXPECTED_SECONDS)) expect(seconds).toBeGreaterThan(0);
  });
});
