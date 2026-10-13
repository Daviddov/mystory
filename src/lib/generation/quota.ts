/**
 * Weekly AI quota. Pure logic over the repository, so it is testable and
 * usable from the page (to show the state) and the API (to enforce it).
 *
 * Rules:
 *  - Admins are unlimited.
 *  - Everyone else may start `limit` generations per rolling 7 days
 *    (AI_WEEKLY_QUOTA, default 1). Failed jobs do not count, unless the
 *    book had already been saved when the job failed or died.
 *  - Because failed jobs are free, a separate cap on attempts per 24 hours
 *    (any status) stops someone from burning provider cost with jobs that fail.
 *  - One running job per user at a time.
 */
import type { Repository } from "../repo/types";
import type { GenerationJob, User } from "../types";
import { isJobActive, jobCountsAgainstQuota } from "./stale";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS_PER_DAY = 5;

export type QuotaBlock = "weekly" | "attempts" | "active";

export interface QuotaState {
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number;
  /** Why a new generation may not start now; undefined when it may. */
  blocked?: QuotaBlock;
  /** ISO time when the weekly quota frees up (only when blocked === 'weekly'). */
  availableAt?: string;
  /** The user's job that is still queued or running, if any. */
  activeJob?: GenerationJob;
}

type QuotaRepo = Pick<Repository, "listJobs">;

export async function getQuotaState(
  repo: QuotaRepo,
  user: Pick<User, "id" | "role">,
  limit: number,
  now: Date = new Date(),
): Promise<QuotaState> {
  const unlimited = user.role === "admin";
  const jobs = await repo.listJobs({ ownerId: user.id });
  const wizardJobs = jobs.filter((job) => job.kind !== "daily");
  const activeJob = wizardJobs.find(isJobActive);

  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const counted = wizardJobs
    .filter((job) => jobCountsAgainstQuota(job) && job.createdAt >= weekAgo.toISOString())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const used = counted.length;
  const attemptsToday = wizardJobs.filter(
    (job) => job.createdAt >= new Date(now.getTime() - DAY_MS).toISOString(),
  ).length;

  const state: QuotaState = {
    unlimited,
    limit,
    used,
    remaining: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    activeJob,
  };
  if (activeJob) {
    state.blocked = "active";
  } else if (!unlimited && used >= limit) {
    state.blocked = "weekly";
    // The quota frees up when the oldest job that still counts leaves the window.
    const releasing = counted[Math.max(0, used - limit)];
    if (releasing && limit > 0) {
      state.availableAt = new Date(new Date(releasing.createdAt).getTime() + WEEK_MS).toISOString();
    }
  } else if (!unlimited && attemptsToday >= MAX_ATTEMPTS_PER_DAY) {
    state.blocked = "attempts";
  }
  return state;
}

export function quotaMessage(state: QuotaState): string {
  switch (state.blocked) {
    case "active":
      return "כבר יש ספר בהכנה. חכו שיסתיים לפני שמתחילים ספר חדש.";
    case "weekly":
      return state.limit === 0
        ? "יצירת ספרים בבינה מלאכותית סגורה כרגע."
        : state.limit === 1
          ? "אפשר ליצור ספר אחד בשבוע, וכבר יצרתם אחד השבוע."
          : `אפשר ליצור ${state.limit} ספרים בשבוע, וכבר יצרתם ${state.used}.`;
    case "attempts":
      return "היו היום יותר מדי ניסיונות יצירה. נסו שוב מחר.";
    default:
      return "";
  }
}
