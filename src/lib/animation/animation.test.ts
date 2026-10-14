import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockIllustrationSvg, mockVideoProvider } from "../ai/mock";
import { VideoRefusedError, type VideoProvider, type VideoRequest } from "../ai/types";
import { NotFoundError } from "../repo/types";
import { createTempData, type TempData } from "../../test/temp-data";
import { allowsAdaptation, animationLicenseCheck, forbidsDerivatives } from "./license";
import {
  animateBookWith,
  estimateClipCostUsd,
  imageHash,
  isPlaceholderIllustration,
  isVideoCurrent,
  isVideoStale,
  motionPrompt,
  removeBookAnimationWith,
  videoCostPerSecondUsd,
  type AnimationDeps,
} from "./pipeline";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const PLAIN_SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

/** A pretend real video vendor: distinct bytes per call, optional refusal per page prompt. */
function fakeRealVideo(options: { refuseWhen?: (request: VideoRequest) => boolean; costUsd?: number } = {}) {
  const calls: VideoRequest[] = [];
  const provider: VideoProvider & { calls: VideoRequest[] } = {
    name: "fake-veo",
    isMock: false,
    calls,
    async animate(request, signal) {
      signal?.throwIfAborted();
      calls.push(request);
      if (options.refuseWhen?.(request)) throw new VideoRefusedError("blocked by the safety filter");
      return {
        video: new TextEncoder().encode(`mp4:${calls.length}`),
        contentType: "video/mp4",
        durationSeconds: 4,
        isMock: false,
        ...(options.costUsd !== undefined ? { usage: { costUsd: options.costUsd } } : {}),
      };
    },
  };
  return provider;
}

describe("animation license guard", () => {
  it("detects NoDerivatives licenses", () => {
    for (const license of ["CC BY-ND 4.0", "CC BY-NC-ND 4.0", "cc by-nd", "BY ND", "CC Attribution-NoDerivatives 4.0", "NoDerivs", "ללא יצירות נגזרות"]) {
      expect(forbidsDerivatives(license), license).toBe(true);
    }
    for (const license of ["CC BY 4.0", "CC BY-SA 4.0", "CC BY-NC-SA 4.0", "CC0 1.0", "Public domain", "Brand and Logo", "לשימוש אישי", ""]) {
      expect(forbidsDerivatives(license), license).toBe(false);
    }
  });

  it("allows adaptations only under licenses that say so", () => {
    expect(allowsAdaptation("CC BY 4.0")).toBe(true);
    expect(allowsAdaptation("CC BY-SA 4.0")).toBe(true);
    expect(allowsAdaptation("CC0 1.0")).toBe(true);
    expect(allowsAdaptation("Public domain")).toBe(true);
    expect(allowsAdaptation("CC BY-ND 4.0")).toBe(false);
    expect(allowsAdaptation("כל הזכויות שמורות")).toBe(false);
    expect(allowsAdaptation("")).toBe(false);
  });

  it("refuses ND for every origin, allows books made here, needs an open license for imports", () => {
    expect(animationLicenseCheck({ origin: "ai", license: "לשימוש אישי" })).toEqual({ allowed: true });
    expect(animationLicenseCheck({ origin: "manual", license: "כל הזכויות שמורות" })).toEqual({ allowed: true });
    expect(animationLicenseCheck({ origin: "import", license: "CC BY 4.0" })).toEqual({ allowed: true });
    expect(animationLicenseCheck({ origin: "import", license: "CC BY-SA 4.0" })).toEqual({ allowed: true });
    expect(animationLicenseCheck({ origin: "import", license: "CC BY-ND 4.0" })).toMatchObject({
      allowed: false,
      reason: "no-derivatives",
    });
    expect(animationLicenseCheck({ origin: "manual", license: "CC BY-NC-ND 4.0" })).toMatchObject({
      allowed: false,
      reason: "no-derivatives",
    });
    expect(animationLicenseCheck({ origin: "import", license: "" })).toMatchObject({
      allowed: false,
      reason: "unknown-license",
    });
    expect(animationLicenseCheck({ origin: "import", license: "כל הזכויות שמורות" })).toMatchObject({
      allowed: false,
      reason: "unknown-license",
    });
  });
});

describe("animation helpers", () => {
  it("knows when a clip belongs to the current picture", () => {
    const hash = imageHash(PNG);
    expect(isVideoCurrent({ video: "v.mp4", videoImageHash: hash }, hash)).toBe(true);
    expect(isVideoCurrent({ video: "v.mp4", videoImageHash: hash }, imageHash(PNG2))).toBe(false);
    expect(isVideoStale({ video: "v.mp4", videoImageHash: hash }, imageHash(PNG2))).toBe(true);
    expect(isVideoStale({ video: "v.mp4", videoImageHash: hash }, null)).toBe(true);
    expect(isVideoStale({}, hash)).toBe(false);
  });

  it("builds a gentle, deterministic motion prompt from the alt text or the page text", () => {
    const fromAlt = motionPrompt({ text: "דנה הלכה ליער", imageAlt: "A girl walks in a forest" });
    expect(fromAlt).toContain("The picture shows: A girl walks in a forest");
    expect(fromAlt).toMatch(/No camera movement/);
    expect(motionPrompt({ text: "דנה הלכה ליער" })).toContain("The picture shows: דנה הלכה ליער");
    expect(motionPrompt({ text: "  " })).not.toContain("The picture shows");
    expect(motionPrompt({ text: "x".repeat(1000) }).length).toBeLessThan(1000);
  });

  it("estimates the cost and reads the price from the environment", () => {
    expect(estimateClipCostUsd(4, 0.15)).toBeCloseTo(0.6);
    expect(videoCostPerSecondUsd({ VIDEO_COST_PER_SECOND_USD: "0.4" })).toBe(0.4);
    expect(videoCostPerSecondUsd({ VIDEO_COST_PER_SECOND_USD: "nope" })).toBe(0.15);
    expect(videoCostPerSecondUsd({})).toBe(0.15);
    expect(videoCostPerSecondUsd({ VIDEO_PROVIDER: "gemini" })).toBe(0.05);
    expect(videoCostPerSecondUsd({ VIDEO_PROVIDER: "gemini", VIDEO_MODEL: "veo-3.1-fast-generate-preview" })).toBe(0.1);
  });

  it("recognises the demo placeholder illustrations", () => {
    const svg = new TextEncoder().encode(mockIllustrationSvg({ prompt: "a cat", style: "watercolor" } as never));
    expect(isPlaceholderIllustration(svg, "image/svg+xml")).toBe(true);
    expect(isPlaceholderIllustration(PLAIN_SVG, "image/svg+xml")).toBe(false);
    expect(isPlaceholderIllustration(PNG, "image/png")).toBe(false);
  });
});

describe("animation pipeline", () => {
  let temp: TempData;
  let bookId: string;
  const deps = (overrides: Partial<AnimationDeps> = {}): AnimationDeps => ({
    repo: temp.repo,
    media: temp.media,
    video: mockVideoProvider,
    ...overrides,
  });

  async function makeBook(input: { license?: string; origin?: "ai" | "manual" | "import" } = {}) {
    await temp.media.put("books/b/p1.png", PNG, "image/png");
    await temp.media.put("books/b/p2.svg", PLAIN_SVG, "image/svg+xml");
    const book = await temp.repo.createBook({
      title: "ספר בדיקה",
      ownerId: "u_owner",
      license: input.license ?? "CC BY 4.0",
      origin: input.origin ?? "import",
      pages: [
        { index: 0, text: "דנה בגן", image: "books/b/p1.png", imageAlt: "A girl in a garden" },
        { index: 1, text: "חתול על הגג", image: "books/b/p2.svg" },
        { index: 2, text: "עמוד בלי איור" },
      ],
    });
    return book.id;
  }

  beforeEach(async () => {
    temp = await createTempData();
    bookId = await makeBook();
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it("stores mock clips labelled as mock and skips pages without a picture", async () => {
    const summary = await animateBookWith(deps(), bookId);
    expect(summary).toMatchObject({ total: 3, animated: 2, skipped: 1, failed: 0, providerMock: true, estimatedCostUsd: 0 });
    expect(summary.results[2]).toMatchObject({ status: "skipped", reason: "no-image" });

    const book = await temp.repo.getBookById(bookId);
    const [first] = book!.pages;
    expect(first.video).toMatch(new RegExp(`^books/${bookId}/animation-01-[0-9a-f]{10}\\.mp4$`));
    expect(first.videoSource).toBe("mock");
    expect(first.videoImageHash).toBe(imageHash(PNG));
    expect(await temp.media.get(first.video!)).not.toBeNull();
  });

  it("is idempotent, and force animates again and deletes the old clip", async () => {
    const real = fakeRealVideo();
    await animateBookWith(deps({ video: real }), bookId, { pages: [0] });
    const before = (await temp.repo.getBookById(bookId))!.pages[0].video!;

    const again = await animateBookWith(deps({ video: real }), bookId, { pages: [0] });
    expect(again.results[0]).toMatchObject({ status: "skipped", reason: "up-to-date" });
    expect(real.calls).toHaveLength(1);

    const forced = await animateBookWith(deps({ video: real }), bookId, { pages: [0], force: true });
    expect(forced.results[0].status).toBe("animated");
    const after = (await temp.repo.getBookById(bookId))!.pages[0].video!;
    expect(after).not.toBe(before);
    expect(await temp.media.get(before)).toBeNull();
  });

  it("sends the picture and a motion prompt, and reports the cost", async () => {
    const real = fakeRealVideo({ costUsd: 0.5 });
    const summary = await animateBookWith(deps({ video: real }), bookId, { pages: [0] });
    expect(real.calls[0]).toMatchObject({ imageContentType: "image/png", durationSeconds: 4 });
    expect(real.calls[0].image).toEqual(PNG);
    expect(real.calls[0].prompt).toContain("A girl in a garden");
    expect(summary).toMatchObject({ animated: 1, estimatedCostUsd: 0.5, pagesToAnimate: 1 });
    expect((await temp.repo.getBookById(bookId))!.pages[0].videoSource).toBe("ai");
  });

  it("replaces a mock clip once a real provider exists, but never a real clip with a mock", async () => {
    await animateBookWith(deps(), bookId, { pages: [0] });
    const real = fakeRealVideo();
    const upgraded = await animateBookWith(deps({ video: real }), bookId, { pages: [0] });
    expect(upgraded.results[0]).toMatchObject({ status: "animated", videoSource: "ai" });

    const kept = await animateBookWith(deps(), bookId, { pages: [0], force: true });
    expect(kept.results[0]).toMatchObject({ status: "skipped", reason: "kept-real-video", videoSource: "ai" });
  });

  it("animates again when the picture changed", async () => {
    const real = fakeRealVideo();
    await animateBookWith(deps({ video: real }), bookId, { pages: [0] });
    await temp.media.put("books/b/p1.png", PNG2, "image/png");
    const book = (await temp.repo.getBookById(bookId))!;
    expect(isVideoStale(book.pages[0], imageHash(PNG2))).toBe(true);

    const summary = await animateBookWith(deps({ video: real }), bookId, { pages: [0] });
    expect(summary.results[0].status).toBe("animated");
    expect((await temp.repo.getBookById(bookId))!.pages[0].videoImageHash).toBe(imageHash(PNG2));
  });

  it("rasterizes SVG for a real provider, or skips it without a rasterizer", async () => {
    const real = fakeRealVideo();
    const skipped = await animateBookWith(deps({ video: real }), bookId, { pages: [1] });
    expect(skipped.results[0]).toMatchObject({ status: "skipped", reason: "unsupported-image" });
    expect(real.calls).toHaveLength(0);

    const rasterized = await animateBookWith(
      deps({ video: real, rasterize: async () => ({ bytes: PNG, contentType: "image/png" }) }),
      bookId,
      { pages: [1] },
    );
    expect(rasterized.results[0].status).toBe("animated");
    expect(real.calls[0].imageContentType).toBe("image/png");
    // The hash is of the stored SVG, not of the bitmap sent to the vendor.
    expect((await temp.repo.getBookById(bookId))!.pages[1].videoImageHash).toBe(imageHash(PLAIN_SVG));
  });

  it("does not send demo placeholder pictures to a real provider", async () => {
    const svg = new TextEncoder().encode(mockIllustrationSvg({ prompt: "a cat", style: "x" } as never));
    await temp.media.put("books/b/p2.svg", svg, "image/svg+xml");
    const real = fakeRealVideo();
    const summary = await animateBookWith(deps({ video: real, rasterize: async () => null }), bookId, { pages: [1] });
    expect(summary.results[0]).toMatchObject({ status: "skipped", reason: "placeholder-image" });
    expect(real.calls).toHaveLength(0);
  });

  it("records a refusal and goes on with the next page", async () => {
    const real = fakeRealVideo({ refuseWhen: (request) => request.prompt.includes("A girl in a garden") });
    const summary = await animateBookWith(
      deps({ video: real, rasterize: async () => ({ bytes: PNG, contentType: "image/png" }) }),
      bookId,
    );
    expect(summary).toMatchObject({ refused: 1, animated: 1, skipped: 1, failed: 0 });
    expect(summary.results[0]).toMatchObject({ status: "refused", error: "blocked by the safety filter" });
    expect((await temp.repo.getBookById(bookId))!.pages[0].video).toBeUndefined();
  });

  it("reports a failing page and continues", async () => {
    let n = 0;
    const flaky: VideoProvider = {
      name: "flaky",
      isMock: false,
      async animate() {
        n++;
        if (n === 1) throw new Error("vendor timeout");
        return { video: new Uint8Array([1]), contentType: "video/mp4", durationSeconds: 4, isMock: false };
      },
    };
    const summary = await animateBookWith(
      deps({ video: flaky, rasterize: async () => ({ bytes: PNG, contentType: "image/png" }) }),
      bookId,
    );
    expect(summary).toMatchObject({ failed: 1, animated: 1 });
    expect(summary.results[0]).toMatchObject({ status: "failed", error: "vendor timeout" });
  });

  it("dry run estimates the cost without calling the provider or writing", async () => {
    const real = fakeRealVideo();
    const summary = await animateBookWith(
      deps({ video: real, rasterize: async () => ({ bytes: PNG, contentType: "image/png" }) }),
      bookId,
      { dryRun: true, costPerSecondUsd: 0.2 },
    );
    expect(real.calls).toHaveLength(0);
    expect(summary).toMatchObject({ dryRun: true, pagesToAnimate: 2, estimatedCostUsd: 1.6, animated: 0 });
    expect(summary.results.map((r) => r.reason)).toEqual(["would-animate", "would-animate", "no-image"]);
    expect((await temp.repo.getBookById(bookId))!.pages.every((p) => !p.video)).toBe(true);
  });

  it("refuses a book whose license forbids derivatives, even with force", async () => {
    const ndBook = await makeBook({ license: "CC BY-ND 4.0" });
    const real = fakeRealVideo();
    const summary = await animateBookWith(deps({ video: real }), ndBook, { force: true });
    expect(summary.license).toMatchObject({ allowed: false, reason: "no-derivatives" });
    expect(summary.results).toHaveLength(0);
    expect(real.calls).toHaveLength(0);
  });

  it("finds the book by slug and throws NotFoundError for a missing one", async () => {
    const book = (await temp.repo.getBookById(bookId))!;
    const summary = await animateBookWith(deps(), book.slug, { pages: [0] });
    expect(summary.bookId).toBe(bookId);
    await expect(animateBookWith(deps(), "no-such-book")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("stops before the next page when aborted", async () => {
    const controller = new AbortController();
    const summary = await animateBookWith(deps(), bookId, {
      signal: controller.signal,
      onPage: () => controller.abort(),
    });
    expect(summary.aborted).toBe(true);
    expect(summary.results).toHaveLength(1);
  });

  it("removes clips and their files", async () => {
    await animateBookWith(deps(), bookId);
    const before = (await temp.repo.getBookById(bookId))!;
    const files = before.pages.map((p) => p.video).filter(Boolean) as string[];
    expect(files).toHaveLength(2);

    const partial = await removeBookAnimationWith(deps(), bookId, { pages: [1] });
    expect(partial.removed).toEqual([1]);
    const middle = (await temp.repo.getBookById(bookId))!;
    expect(middle.pages[0].video).toBe(files[0]);
    expect(middle.pages[1]).not.toHaveProperty("video");
    expect(middle.pages[1]).not.toHaveProperty("videoImageHash");
    expect(await temp.media.get(files[1])).toBeNull();

    const rest = await removeBookAnimationWith(deps(), bookId);
    expect(rest.removed).toEqual([0]);
    expect(await temp.media.get(files[0])).toBeNull();
    expect((await removeBookAnimationWith(deps(), bookId)).removed).toEqual([]);
  });
});
