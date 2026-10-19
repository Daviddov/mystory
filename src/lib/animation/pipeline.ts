/**
 * The animation pipeline ("bring illustrations to life"):
 * page illustration -> short silent looping clip -> stored media + Page.video.
 *
 * This file takes its dependencies as arguments and imports nothing that is
 * "server-only", so the CLI (scripts/animate.ts) and the tests can use it
 * directly. The app uses the wrappers in ./index.ts.
 *
 * Rules:
 *  - The book's license must allow derivative works (see ./license.ts);
 *    otherwise nothing is done, whatever `force` says.
 *  - A page is animated once. It is skipped when its clip was made from the
 *    current illustration bytes (Page.videoImageHash), unless `force` is set.
 *  - Demo (mock) clips are stored as videoSource "mock" and are replaced
 *    automatically once a real video provider is configured. A real clip is
 *    never replaced by a demo clip.
 *  - Pages without an illustration are skipped. Demo placeholder illustrations
 *    are not sent to a real provider. SVG (and other formats the vendors do
 *    not take) go through the optional `rasterize` dependency; without it they
 *    are skipped as "unsupported-image".
 *  - A vendor refusal (VideoRefusedError, e.g. a safety filter) is recorded as
 *    status "refused" and the run goes on with the next page.
 *  - `dryRun` calls no provider and writes nothing: it reports which pages
 *    would be animated and the estimated cost.
 */
import { createHash } from "node:crypto";
import { VEO_DEFAULT_MODEL, VEO_PRICE_PER_SECOND_720P } from "../ai/providers/video";
import { VideoQuotaError, VideoRefusedError, type VideoProvider } from "../ai/types";
import { withBookLock } from "../book-lock";
import { animationDirection } from "../generation/presets";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import { NotFoundError, type Repository } from "../repo/types";
import type { BookWithPages, Page } from "../types";
import { animationLicenseCheck } from "./license";
import type { AnimationOptions, BookAnimationRemoval, BookAnimationSummary, PageAnimationResult } from "./types";

/** Turns an illustration the vendor cannot read (e.g. SVG) into PNG/JPEG/WebP. Null when it cannot. */
export type Rasterizer = (
  bytes: Uint8Array,
  contentType: string,
) => Promise<{ bytes: Uint8Array; contentType: string } | null>;

export interface AnimationDeps {
  repo: Repository;
  media: MediaStore;
  video: VideoProvider;
  /** Optional; without it SVG illustrations are skipped as "unsupported-image" by a real provider. */
  rasterize?: Rasterizer;
}

export interface BookAnimationOptions extends AnimationOptions {
  /** Zero-based page indexes to animate; default all pages. */
  pages?: number[];
  /** Called after every page. */
  onPage?: (result: PageAnimationResult, done: number, total: number) => void;
  /** Stops before the next page when aborted, and is passed to the provider. */
  signal?: AbortSignal;
  /** Report what would be animated and the estimated cost; call no provider, write nothing. */
  dryRun?: boolean;
}

/** Clip length asked of the provider. Veo supports 4-8 seconds; short clips loop best and cost least. */
/** Looping clips (first frame = last frame) are 8 s with Veo; see veoClipSeconds(). */
export const DEFAULT_CLIP_SECONDS = 8;

/**
 * Estimated price of one second of generated video, in USD (Veo "fast" tier,
 * without audio, 2026 list price). Override with VIDEO_COST_PER_SECOND_USD.
 */
export const DEFAULT_VIDEO_COST_PER_SECOND_USD = 0.15;

/** Image types the video vendors accept as the first frame. */
export const ANIMATABLE_IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

/** Files written by this pipeline are named "animation-<page>-<hash>.<ext>". */
const ANIMATION_FILE_PREFIX = "animation-";

/** The watermark text of the demo illustrations (see mockIllustrationSvg in ../ai/mock). */
const PLACEHOLDER_MARK = "איור לדוגמה";

const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Hash of an illustration's bytes, stored in Page.videoImageHash. */
export function imageHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** True when the page has a clip and it was made from the illustration whose hash is given. */
export function isVideoCurrent(page: Pick<Page, "video" | "videoImageHash">, currentImageHash: string): boolean {
  return !!page.video && page.videoImageHash === currentImageHash;
}

/**
 * True when the page has a clip that no longer belongs to its illustration
 * (the image was replaced or removed). Pass null when the page has no image.
 */
export function isVideoStale(
  page: Pick<Page, "video" | "videoImageHash">,
  currentImageHash: string | null,
): boolean {
  if (!page.video) return false;
  return currentImageHash === null || page.videoImageHash !== currentImageHash;
}

/** True for the demo placeholder illustrations of the mock image provider. */
export function isPlaceholderIllustration(bytes: Uint8Array, contentType: string): boolean {
  if (!contentType.toLowerCase().includes("svg")) return false;
  return new TextDecoder().decode(bytes.subarray(0, 64 * 1024)).includes(PLACEHOLDER_MARK);
}

function collapse(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The motion instruction sent with the illustration: a fixed English template
 * asking for gentle, loopable motion, plus what the picture shows (its
 * alternative text, or the page text). Deterministic: no text model involved.
 */
export function motionPrompt(
  page: Pick<Page, "imageAlt" | "text">,
  direction: { motion?: string; notes?: string } = {},
): string {
  const sceneHint = collapse(page.imageAlt?.trim() || page.text, 300);
  return [
    "Bring this children's picture-book illustration gently to life as a short, silent, seamlessly looping clip.",
    "The first and last frames should match the illustration; every character stays exactly as drawn.",
    animationDirection({ ...direction, sceneHint }),
  ].join("\n");
}

/** Estimated cost of one clip in USD. */
export function estimateClipCostUsd(
  durationSeconds = DEFAULT_CLIP_SECONDS,
  costPerSecondUsd = DEFAULT_VIDEO_COST_PER_SECOND_USD,
): number {
  return roundUsd(durationSeconds * costPerSecondUsd);
}

/**
 * VIDEO_COST_PER_SECOND_USD from the environment; otherwise the Veo price of
 * VIDEO_MODEL (default model) when VIDEO_PROVIDER=gemini; otherwise the default.
 */
export function videoCostPerSecondUsd(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number(env.VIDEO_COST_PER_SECOND_USD?.trim());
  if (Number.isFinite(parsed) && parsed >= 0 && env.VIDEO_COST_PER_SECOND_USD?.trim()) return parsed;
  if (env.VIDEO_PROVIDER?.trim().toLowerCase() === "gemini") {
    const price = VEO_PRICE_PER_SECOND_720P[env.VIDEO_MODEL?.trim() || VEO_DEFAULT_MODEL];
    if (price !== undefined) return price;
  }
  return DEFAULT_VIDEO_COST_PER_SECOND_USD;
}

function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRefusal(err: unknown): boolean {
  // The name check also matches a VideoRefusedError from a second copy of the module.
  return err instanceof VideoRefusedError || (err instanceof Error && err.name === "VideoRefusedError");
}

function isQuota(err: unknown): boolean {
  return err instanceof VideoQuotaError || (err instanceof Error && err.name === "VideoQuotaError");
}

function videoExtension(contentType: string): string {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const known = extensionForContentType(type);
  return known !== "bin" ? known : (VIDEO_EXTENSIONS[type] ?? "mp4");
}

function animationFileName(pageIndex: number, bytes: Uint8Array, contentType: string): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const number = String(pageIndex + 1).padStart(2, "0");
  return `${ANIMATION_FILE_PREFIX}${number}-${hash}.${videoExtension(contentType)}`;
}

function isAnimationFile(bookId: string, mediaPath: string | undefined): mediaPath is string {
  return !!mediaPath && mediaPath.startsWith(`${bookMediaPrefix(bookId)}/${ANIMATION_FILE_PREFIX}`);
}

function withoutVideo(page: Page): Page {
  const next: Page = { ...page };
  delete next.video;
  delete next.videoImageHash;
  delete next.videoSource;
  return next;
}

async function loadBook(repo: Repository, bookIdOrSlug: string): Promise<BookWithPages> {
  const book = (await repo.getBookById(bookIdOrSlug)) ?? (await repo.getBookBySlug(bookIdOrSlug));
  if (!book) throw new NotFoundError(`book ${bookIdOrSlug}`);
  return book;
}

// ---------------------------------------------------------------------------
// One page
// ---------------------------------------------------------------------------

/** Animates one page of an already loaded book. Throws when the provider or the storage fails. */
async function animateLoadedPage(
  deps: AnimationDeps,
  book: BookWithPages,
  page: Page,
  options: BookAnimationOptions,
): Promise<PageAnimationResult> {
  const base: PageAnimationResult = { bookId: book.id, pageIndex: page.index, status: "skipped", warnings: [] };
  const seconds = options.durationSeconds ?? DEFAULT_CLIP_SECONDS;
  const perSecond = options.costPerSecondUsd ?? DEFAULT_VIDEO_COST_PER_SECOND_USD;
  const estimate = deps.video.isMock ? 0 : estimateClipCostUsd(seconds, perSecond);

  if (!page.image) return { ...base, reason: "no-image" };
  const image = await deps.media.get(page.image);
  if (!image) return { ...base, reason: "no-image", warnings: ["the illustration file is missing"] };
  const hash = imageHash(image.bytes);

  // 1. Keep what is already there when it may be kept.
  if (page.video) {
    const existing = { video: page.video, ...(page.videoSource ? { videoSource: page.videoSource } : {}) };
    const isDemo = page.videoSource === "mock";
    if (deps.video.isMock && !isDemo) {
      const warnings = isVideoCurrent(page, hash) ? [] : ["the real clip was made from an older illustration"];
      return { ...base, ...existing, reason: "kept-real-video", warnings };
    }
    if (isVideoCurrent(page, hash) && (await deps.media.get(page.video)) !== null) {
      const upgradeFromDemo = isDemo && !deps.video.isMock;
      if (!options.force && !upgradeFromDemo) return { ...base, ...existing, reason: "up-to-date" };
    }
  }

  // 2. The first frame.
  if (!deps.video.isMock && isPlaceholderIllustration(image.bytes, image.contentType)) {
    return { ...base, reason: "placeholder-image" };
  }
  const prompt = motionPrompt(page, { motion: options.motion, notes: options.notes });
  const contentType = image.contentType.split(";")[0].trim().toLowerCase();
  const needsRaster = !ANIMATABLE_IMAGE_TYPES.includes(contentType);
  if (needsRaster && !deps.rasterize && !deps.video.isMock) {
    return { ...base, reason: "unsupported-image", warnings: [`cannot send ${contentType} to the video provider`] };
  }
  if (options.dryRun) return { ...base, reason: "would-animate", prompt, costUsd: estimate };

  let frame: { bytes: Uint8Array; contentType: string } = { bytes: image.bytes, contentType };
  if (needsRaster && deps.rasterize) {
    const raster = await deps.rasterize(image.bytes, contentType);
    if (raster) frame = raster;
    else if (!deps.video.isMock) {
      return { ...base, reason: "unsupported-image", warnings: [`could not convert ${contentType} to a bitmap`] };
    }
  }

  // 3. The clip.
  const clip = await deps.video.animate(
    { image: frame.bytes, imageContentType: frame.contentType, prompt, durationSeconds: seconds },
    options.signal,
  );
  if (clip.video.byteLength === 0) throw new Error(`video provider "${deps.video.name}" returned an empty clip`);
  const videoSource: "ai" | "mock" = clip.isMock ? "mock" : "ai";
  const costUsd = clip.isMock
    ? 0
    : roundUsd(clip.usage?.costUsd ?? estimateClipCostUsd(clip.durationSeconds || seconds, perSecond));

  // 4. Store the clip, then attach it to the page if the illustration is still the same.
  const videoPath = bookMediaPath(book.id, animationFileName(page.index, clip.video, clip.contentType));
  await deps.media.put(videoPath, clip.video, clip.contentType);

  return withBookLock(book.id, async (): Promise<PageAnimationResult> => {
    const fresh = await deps.repo.getBookById(book.id);
    const current = fresh?.pages[page.index];
    const stillReferenced = (path: string) => !!fresh && fresh.pages.some((p) => p.video === path);

    if (!fresh || !current || current.image !== page.image) {
      if (!stillReferenced(videoPath)) await deps.media.delete(videoPath);
      return {
        ...base,
        reason: "stale",
        costUsd,
        warnings: [...base.warnings, "the illustration changed while it was animated"],
      };
    }
    // A clip attached meanwhile (e.g. the user's own upload) was not part of the replace decision: keep it.
    if (current.video !== page.video) {
      if (!stillReferenced(videoPath)) await deps.media.delete(videoPath);
      return {
        ...base,
        reason: "stale",
        costUsd,
        warnings: [...base.warnings, "another clip was attached to the page while it was animated"],
      };
    }

    const pages = fresh.pages.map((p) =>
      p.index === page.index ? { ...p, video: videoPath, videoImageHash: hash, videoSource } : p,
    );
    const saved = await deps.repo.replacePages(book.id, pages);

    const oldVideo = current.video;
    if (oldVideo !== videoPath && isAnimationFile(book.id, oldVideo) && !saved.pages.some((p) => p.video === oldVideo)) {
      await deps.media.delete(oldVideo).catch(() => undefined);
    }

    return {
      ...base,
      status: "animated",
      video: videoPath,
      videoSource,
      durationSeconds: clip.durationSeconds,
      costUsd,
      prompt,
    };
  });
}

// ---------------------------------------------------------------------------
// A book
// ---------------------------------------------------------------------------

/**
 * Animates the pages of a book (by id, or by slug), one after the other. A
 * page that fails is reported with status "failed", a page the vendor refuses
 * with "refused", and the run continues with the next page.
 */
export async function animateBookWith(
  deps: AnimationDeps,
  bookIdOrSlug: string,
  options: BookAnimationOptions = {},
): Promise<BookAnimationSummary> {
  const book = await loadBook(deps.repo, bookIdOrSlug);
  const bookId = book.id;
  const wanted = options.pages ? new Set(options.pages) : null;
  const indexes = book.pages.map((page) => page.index).filter((index) => !wanted || wanted.has(index));

  const summary: BookAnimationSummary = {
    bookId,
    total: indexes.length,
    animated: 0,
    skipped: 0,
    refused: 0,
    failed: 0,
    provider: deps.video.name,
    providerMock: deps.video.isMock,
    dryRun: !!options.dryRun,
    pagesToAnimate: 0,
    estimatedCostUsd: 0,
    aborted: false,
    results: [],
  };

  const license = animationLicenseCheck(book);
  if (!license.allowed) {
    summary.license = license;
    return summary;
  }

  for (const pageIndex of indexes) {
    if (options.signal?.aborted) {
      summary.aborted = true;
      break;
    }
    let result: PageAnimationResult;
    try {
      // Re-read the book for each page so earlier pages' writes and outside edits are seen.
      const fresh = await deps.repo.getBookById(bookId);
      if (!fresh) throw new NotFoundError(`book ${bookId}`);
      const page = fresh.pages[pageIndex];
      if (!page) throw new NotFoundError(`page ${pageIndex} of book ${bookId}`);
      result = await animateLoadedPage(deps, fresh, page, options);
    } catch (err) {
      result = {
        bookId,
        pageIndex,
        status: isRefusal(err) ? "refused" : "failed",
        warnings: [],
        error: errorMessage(err),
      };
      if (options.signal?.aborted) summary.aborted = true;
      // Every further page would hit the same limit: stop, and let a later run continue.
      if (isQuota(err)) {
        summary.quotaExceeded = true;
        summary.aborted = true;
      }
    }
    summary.results.push(result);
    summary[result.status]++;
    if (result.status === "animated" || result.reason === "would-animate") summary.pagesToAnimate++;
    summary.estimatedCostUsd = roundUsd(summary.estimatedCostUsd + (result.costUsd ?? 0));
    options.onPage?.(result, summary.results.length, summary.total);
    if (summary.aborted) break;
  }
  return summary;
}

/**
 * Removes the clips of a book's pages (default: all pages). Clip files made by
 * this pipeline are deleted when no page refers to them any more.
 */
export async function removeBookAnimationWith(
  deps: Pick<AnimationDeps, "repo" | "media">,
  bookIdOrSlug: string,
  options: { pages?: number[] } = {},
): Promise<BookAnimationRemoval> {
  const book = await loadBook(deps.repo, bookIdOrSlug);
  const wanted = options.pages ? new Set(options.pages) : null;
  return withBookLock(book.id, async () => {
    const fresh = await deps.repo.getBookById(book.id);
    if (!fresh) throw new NotFoundError(`book ${book.id}`);
    const removed: number[] = [];
    const oldFiles: string[] = [];
    const pages = fresh.pages.map((page) => {
      if ((wanted && !wanted.has(page.index)) || (!page.video && !page.videoImageHash && !page.videoSource)) {
        return page;
      }
      removed.push(page.index);
      if (page.video) oldFiles.push(page.video);
      return withoutVideo(page);
    });
    if (removed.length === 0) return { bookId: fresh.id, removed };
    const saved = await deps.repo.replacePages(fresh.id, pages);
    for (const file of oldFiles) {
      if (isAnimationFile(fresh.id, file) && !saved.pages.some((p) => p.video === file)) {
        await deps.media.delete(file).catch(() => undefined);
      }
    }
    return { bookId: fresh.id, removed };
  });
}
