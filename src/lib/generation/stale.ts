/**
 * Dead generation jobs. Jobs run inside the web process (`after()`), so a
 * restart or a timeout can leave one 'running' forever. A job that stopped
 * reporting is settled here: 'done' when its book was already saved (the book
 * exists and counts against the quota), otherwise 'failed'.
 *
 * No "server-only" imports: used by the site and by scripts/daily-story.ts.
 */
import type { Repository } from "../repo/types";
import type { GenerationJob } from "../types";

/** A job that has not reported for this long, and is not running in this process, is treated as dead. */
export const STALE_JOB_MS = 10 * 60 * 1000;

export const STALE_FAILED_MESSAGE =
  "היצירה נקטעה באמצע (השרת הופעל מחדש). הניסיון לא נספר במכסה, ואפשר להתחיל שוב.";
export const STALE_SAVED_MESSAGE =
  "הספר מוכן! היצירה נקטעה לפני שההקראה הושלמה. אפשר להשלים את ההקראה מהסטודיו.";

export function isJobActive(job: Pick<GenerationJob, "status">): boolean {
  return job.status === "queued" || job.status === "running";
}

/** `isRunningHere` tells whether this process is still working on the job (then it is never stale). */
export function isJobStale(
  job: GenerationJob,
  isRunningHere: (jobId: string) => boolean = () => false,
  now: number = Date.now(),
): boolean {
  if (!isJobActive(job)) return false;
  if (isRunningHere(job.id)) return false;
  const last = Date.parse(job.updatedAt ?? job.createdAt);
  return Number.isFinite(last) && now - last > STALE_JOB_MS;
}

/**
 * Closes a dead job. The pipeline writes `bookId` on the job right after the
 * book is saved, so a dead job with a book that still exists produced a book:
 * it becomes 'done' and keeps counting against the quota.
 */
export async function settleStaleJob(
  repo: Pick<Repository, "updateJob" | "getBookById">,
  job: GenerationJob,
): Promise<GenerationJob> {
  if (job.bookId && (await repo.getBookById(job.bookId))) {
    return repo.updateJob(job.id, { status: "done", step: "done", progress: 100, message: STALE_SAVED_MESSAGE });
  }
  return repo.updateJob(job.id, { status: "failed", step: "failed", message: "", error: STALE_FAILED_MESSAGE });
}

/**
 * True when the job used up a generation: it did not fail, or it failed (or
 * died) after its book had been saved.
 */
export function jobCountsAgainstQuota(job: Pick<GenerationJob, "status" | "bookId">): boolean {
  return job.status !== "failed" || !!job.bookId;
}
