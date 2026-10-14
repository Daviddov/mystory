/**
 * Animation entry point ("bring illustrations to life"). Server only.
 *
 *   await animateBook(bookId, { dryRun: true });   // which pages, and the estimated cost
 *   await animateBook(bookId);                     // animate every page that needs it
 *   await removeBookAnimation(bookId);             // drop the clips again
 *
 * The provider comes from "@/lib/ai": the mock unless VIDEO_PROVIDER is set.
 * With the mock the stored clip is a flat placeholder, labelled videoSource
 * "mock". These functions do NOT check permissions; the caller does (see
 * src/app/api/admin/books/[id]/animate).
 */
import "server-only";
import { getVideoProvider } from "../ai";
import { getMediaStore } from "../media";
import { getRepo } from "../repo";
import {
  animateBookWith,
  removeBookAnimationWith,
  videoCostPerSecondUsd,
  type AnimationDeps,
  type BookAnimationOptions,
} from "./pipeline";
import { rasterizeForVideo } from "./raster";
import type { BookAnimationRemoval, BookAnimationSummary } from "./types";

export * from "./types";
export { allowsAdaptation, animationLicenseCheck, forbidsDerivatives } from "./license";
export {
  DEFAULT_CLIP_SECONDS,
  DEFAULT_VIDEO_COST_PER_SECOND_USD,
  estimateClipCostUsd,
  imageHash,
  isVideoCurrent,
  isVideoStale,
  motionPrompt,
  videoCostPerSecondUsd,
  type AnimationDeps,
  type BookAnimationOptions,
} from "./pipeline";

export async function getAnimationDeps(): Promise<AnimationDeps> {
  const [repo, media, video] = await Promise.all([getRepo(), getMediaStore(), getVideoProvider()]);
  return { repo, media, video, rasterize: rasterizeForVideo };
}

/** Animates the pages of a book. Pages whose clip matches the illustration are skipped unless `force` is set. */
export async function animateBook(bookId: string, options: BookAnimationOptions = {}): Promise<BookAnimationSummary> {
  return animateBookWith(await getAnimationDeps(), bookId, {
    costPerSecondUsd: videoCostPerSecondUsd(),
    ...options,
  });
}

/** Removes the clips of a book's pages (default all). */
export async function removeBookAnimation(
  bookId: string,
  options: { pages?: number[] } = {},
): Promise<BookAnimationRemoval> {
  const [repo, media] = await Promise.all([getRepo(), getMediaStore()]);
  return removeBookAnimationWith({ repo, media }, bookId, options);
}
