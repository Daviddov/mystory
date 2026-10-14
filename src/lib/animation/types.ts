/**
 * Animation types ("bring illustrations to life"). Client-safe (types only),
 * so the admin console can read the progress stream of
 * POST /api/admin/books/<id>/animate.
 */

export interface AnimationOptions {
  /** Animate again even when the stored clip already matches the illustration. */
  force?: boolean;
  /** Requested clip length in seconds; the provider rounds it. Default DEFAULT_CLIP_SECONDS. */
  durationSeconds?: number;
  /** Estimated price of one second of video, in USD. Default DEFAULT_VIDEO_COST_PER_SECOND_USD. */
  costPerSecondUsd?: number;
}

export type PageAnimationStatus = "animated" | "skipped" | "refused" | "failed";

/**
 * Why a page was skipped:
 *   no-image           the page has no illustration (or its file is missing)
 *   up-to-date         the clip was made from the current illustration
 *   kept-real-video    only the demo provider is available and the page already has a real clip
 *   placeholder-image  the illustration itself is a demo placeholder; a real clip of it is a waste
 *   unsupported-image  the illustration format cannot be sent to the video provider (e.g. SVG without a rasterizer)
 *   stale              the illustration changed while the clip was made; nothing was stored
 *   would-animate      dry run: the page would be animated
 */
export type PageAnimationSkipReason =
  | "no-image"
  | "up-to-date"
  | "kept-real-video"
  | "placeholder-image"
  | "unsupported-image"
  | "stale"
  | "would-animate";

export interface PageAnimationResult {
  bookId: string;
  /** Zero-based. */
  pageIndex: number;
  status: PageAnimationStatus;
  reason?: PageAnimationSkipReason;
  /** Media path of the clip (stored now, or kept). */
  video?: string;
  /** "mock" means a demo placeholder clip: the UI must say so. */
  videoSource?: "ai" | "mock";
  durationSeconds?: number;
  /** Cost of this page in USD: measured or estimated when animated, estimated for a dry run. */
  costUsd?: number;
  /** The motion instruction sent to the provider (animated and dry-run pages). */
  prompt?: string;
  warnings: string[];
  /** Set when status is "failed" or "refused" (the vendor's message, in English). */
  error?: string;
}

export type AnimationLicenseRefusal = "no-derivatives" | "unknown-license";

export type AnimationLicenseCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: AnimationLicenseRefusal;
      /** Hebrew, for the admin console. */
      message: string;
    };

export interface BookAnimationSummary {
  bookId: string;
  total: number;
  animated: number;
  skipped: number;
  refused: number;
  failed: number;
  provider: string;
  /** True when the clips produced by this run are demo placeholders. */
  providerMock: boolean;
  dryRun: boolean;
  /** Pages that would be (dry run) or were sent to the provider. */
  pagesToAnimate: number;
  /**
   * Dry run: the estimated cost of animating `pagesToAnimate` pages.
   * Real run: the sum of the pages' measured or estimated costs.
   * Always 0 with the demo provider.
   */
  estimatedCostUsd: number;
  /** True when the run was stopped before all pages were handled. */
  aborted: boolean;
  /** The vendor's quota ran out; the run stopped there. Running again later continues. */
  quotaExceeded?: boolean;
  /** Set when the book's license forbids animation; then no page was handled. */
  license?: AnimationLicenseCheck & { allowed: false };
  results: PageAnimationResult[];
}

/**
 * Lines of the NDJSON progress stream of POST /api/admin/books/<id>/animate:
 *
 *   {"type":"start", ...}            once
 *   {"type":"page", ...}             once per page, in order
 *   {"type":"done","summary":{...}}  last line on success
 *   {"type":"error","error":"..."}   last line when the run itself broke
 */
export type AnimationEvent =
  | { type: "start"; bookId: string; total: number; provider: string; providerMock: boolean }
  | { type: "page"; done: number; total: number; result: PageAnimationResult }
  | { type: "done"; summary: BookAnimationSummary }
  | { type: "error"; error: string };

export interface BookAnimationRemoval {
  bookId: string;
  /** Zero-based indexes of the pages whose clip was removed. */
  removed: number[];
}
