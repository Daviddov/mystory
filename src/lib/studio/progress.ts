/**
 * Progress of the long AI calls of the studio. Pure functions (no React, no timers).
 *
 * A call whose length we cannot see (one story, one picture grid...) shows a
 * time-based estimate: it rises quickly and then slows, approaches CAP but
 * never reaches 100% until the call really resolves. When the call lasts longer
 * than expected the bar says so honestly instead of sitting at 92%.
 * A multi-step job (narration page by page...) shows done/total, optionally
 * with the time-based fraction of the step that is running.
 */

/** What the overlay shows. `progress` is a determinate value 0..1 that wins over any estimate. */
export interface BusyState {
  label: string;
  /** Determinate progress, 0..1. */
  progress?: number;
  /** Expected seconds of the whole call (or of ONE step when `steps` is set). */
  expectedSeconds?: number;
  /** Counted steps (pages, grids): progress = (done + fraction of the running step) / total. */
  steps?: { done: number; total: number };
}

export type BusyInput = string | BusyState | null;

/** Accepts the old plain-label form as well as the object form. */
export function toBusy(input: BusyInput): BusyState | null {
  if (input === null) return null;
  return typeof input === "string" ? { label: input } : input;
}

/** Expected duration in seconds of every kind of AI call, in one place. */
export const EXPECTED_SECONDS = {
  story: 45,
  hero: 25,
  heroWithDescription: 35,
  grid: 70,
  illustratePage: 25,
  details: 10,
  animation: 60,
  translate: 60,
  acceptTranslation: 3,
  nikudPage: 4,
  narrationPage: 12,
  upload: 5,
  bookAction: 3,
} as const;

export type Operation = keyof typeof EXPECTED_SECONDS;

/** The bar never passes this before the call resolves. */
export const PROGRESS_CAP = 0.92;

/** Progress 0..CAP rising like 1 - exp(-t/tau); tau = expected/2, so about 80% at the expected time. */
export function easedProgress(elapsedSeconds: number, expectedSeconds: number, cap: number = PROGRESS_CAP): number {
  if (!(expectedSeconds > 0) || !(elapsedSeconds > 0)) return 0;
  const tau = expectedSeconds / 2;
  return cap * (1 - Math.exp(-elapsedSeconds / tau));
}

/** True when a call without known length has run longer than expected. */
export function isOverdue(elapsedSeconds: number, expectedSeconds: number | undefined): boolean {
  return expectedSeconds !== undefined && expectedSeconds > 0 && elapsedSeconds > expectedSeconds * 1.1;
}

export interface ProgressView {
  /** 0..1, or null when nothing can be estimated (indeterminate). */
  value: number | null;
  /** Whole percent 0..99 while running, or null. */
  percent: number | null;
  /** The call lasts longer than expected: show "לוקח יותר מהצפוי". */
  overdue: boolean;
  /** Seconds left, or null when unknown or overdue. */
  remainingSeconds: number | null;
}

/**
 * The progress to show `elapsedSeconds` after the call started.
 * `stepElapsedSeconds` is the time since the running step started (steps mode); defaults to elapsedSeconds.
 */
export function progressView(busy: BusyState, elapsedSeconds: number, stepElapsedSeconds: number = elapsedSeconds): ProgressView {
  const expected = busy.expectedSeconds;
  let value: number | null = null;
  let overdue = false;
  let remaining: number | null = null;

  if (busy.steps && busy.steps.total > 0) {
    const { done, total } = busy.steps;
    const fraction = expected ? Math.min(easedProgress(stepElapsedSeconds, expected), PROGRESS_CAP) : 0;
    value = Math.max(0, Math.min((done + fraction) / total, 0.99));
    if (expected) {
      const stepLeft = Math.max(0, expected - stepElapsedSeconds);
      remaining = (total - done - 1) * expected + stepLeft;
      overdue = isOverdue(stepElapsedSeconds, expected);
      if (overdue) remaining = (total - done - 1) * expected;
    } else if (done > 0 && elapsedSeconds > 0) {
      remaining = (elapsedSeconds / done) * (total - done);
    }
  } else if (typeof busy.progress === "number") {
    value = Math.max(0, Math.min(busy.progress, 0.99));
    if (value > 0.05 && elapsedSeconds > 2) remaining = (elapsedSeconds * (1 - value)) / value;
  } else if (expected) {
    overdue = isOverdue(elapsedSeconds, expected);
    value = easedProgress(elapsedSeconds, expected);
    remaining = overdue ? null : Math.max(0, expected - elapsedSeconds);
  }

  return {
    value,
    percent: value === null ? null : Math.min(99, Math.floor(value * 100)),
    overdue,
    remainingSeconds: remaining === null ? null : Math.max(0, remaining),
  };
}

/** "נשארו בערך 25 שניות" (rounded: 5 s steps above 10 s, minutes above ~1.5 min). */
export function remainingText(seconds: number): string {
  if (seconds <= 5) return "עוד כמה שניות";
  if (seconds <= 90) {
    const rounded = seconds <= 10 ? Math.ceil(seconds) : Math.ceil(seconds / 5) * 5;
    return `נשארו בערך ${rounded} שניות`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "נשארה בערך דקה" : minutes === 2 ? "נשארו בערך שתי דקות" : `נשארו בערך ${minutes} דקות`;
}

/** "עברו 12 שניות" / "עברו 1:05 דקות". */
export function elapsedText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `עברו ${whole} שניות`;
  return `עברו ${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")} דקות`;
}

export const OVERDUE_TEXT = "לוקח יותר מהצפוי…";

/** The aria-valuetext of the progress bar. */
export function valueText(view: ProgressView): string {
  if (view.percent === null) return "בתהליך";
  const parts = [`${view.percent} אחוז`];
  if (view.overdue) parts.push(OVERDUE_TEXT);
  else if (view.remainingSeconds !== null) parts.push(remainingText(view.remainingSeconds));
  return parts.join(", ");
}
