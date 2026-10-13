/**
 * Regression tests for two review findings about generation jobs:
 *  - a job that is killed after its book was saved was reported as failed and
 *    not counted against the weekly quota;
 *  - a crashed daily-story job blocked that day's story for good.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockImageProvider, mockTextProvider } from "@/lib/ai/mock";
import type { GenerationJob } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";
import { israelDay, startDailyStory } from "./daily";
import { WizardInputSchema } from "./input";
import { runGeneration } from "./pipeline";
import { getQuotaState } from "./quota";
import { STALE_JOB_MS, isJobStale, jobCountsAgainstQuota, settleStaleJob } from "./stale";

const parent = { id: "u_parent", role: "parent" as const };

const input = WizardInputSchema.parse({
  childName: "נועה",
  childGender: "girl",
  childAge: 4,
  hobbies: ["ציור"],
  appearance: "תלתלים חומים",
  idea: "מסע לירח בחללית מקרטון",
  ageGroup: "3-5",
  category: "adventures",
  style: "watercolor",
});

let data: TempData;
beforeEach(async () => {
  data = await createTempData();
});
afterEach(async () => {
  await data.cleanup();
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("the job knows its book as soon as the book is saved", () => {
  it("has the bookId while narration (the slowest step) is still running", async () => {
    const job = await data.repo.createJob({ ownerId: parent.id, kind: "wizard" });
    let duringNarration: GenerationJob | null = null;
    const result = await runGeneration(
      {
        repo: data.repo,
        media: data.media,
        text: mockTextProvider,
        image: mockImageProvider,
        narrate: async (bookId) => {
          duringNarration = await data.repo.getJob(job.id);
          expect(await data.repo.getBookById(bookId)).not.toBeNull();
          return { ttsMock: true };
        },
      },
      { jobId: job.id, ownerId: parent.id, input },
    );
    expect(result.book).not.toBeNull();
    const seen = duringNarration as GenerationJob | null;
    expect(seen?.status).toBe("running");
    expect(seen?.bookId).toBe(result.book!.id);
  });
});

describe("a dead job", () => {
  it("is stale only when it is active, silent for a while, and not running in this process", async () => {
    const job = await data.repo.createJob({ ownerId: parent.id, kind: "wizard", status: "running" });
    const old = { ...job, updatedAt: minutesAgo(11) };
    expect(isJobStale(job)).toBe(false);
    expect(isJobStale(old)).toBe(true);
    expect(isJobStale(old, (id) => id === job.id)).toBe(false);
    expect(isJobStale({ ...old, status: "done" })).toBe(false);
    expect(isJobStale({ ...old, updatedAt: new Date(Date.now() - STALE_JOB_MS + 1000).toISOString() })).toBe(false);
  });

  it("is closed as done and keeps counting against the quota when its book exists", async () => {
    const book = await data.repo.createBook({ title: "ספר שנוצר", ownerId: parent.id, origin: "ai", status: "private" });
    const job = await data.repo.createJob({ ownerId: parent.id, kind: "wizard", status: "running", bookId: book.id });

    const settled = await settleStaleJob(data.repo, job);
    expect(settled.status).toBe("done");
    expect(settled.bookId).toBe(book.id);
    expect(settled.error).toBeUndefined();

    const quota = await getQuotaState(data.repo, parent, 1);
    expect(quota.used).toBe(1);
    expect(quota.blocked).toBe("weekly");
  });

  it("is closed as failed and stays free when no book was saved", async () => {
    const job = await data.repo.createJob({ ownerId: parent.id, kind: "wizard", status: "running" });
    const settled = await settleStaleJob(data.repo, job);
    expect(settled.status).toBe("failed");
    expect(settled.error).toContain("לא נספר במכסה");
    expect((await getQuotaState(data.repo, parent, 1)).blocked).toBeUndefined();

    // A bookId that points at nothing (the book was deleted) does not make the job count as done.
    const orphan = await data.repo.createJob({ ownerId: parent.id, kind: "wizard", status: "running", bookId: "bk_gone" });
    expect((await settleStaleJob(data.repo, orphan)).status).toBe("failed");
  });

  it("counts a failed job against the quota when it had already saved its book", async () => {
    expect(jobCountsAgainstQuota({ status: "failed" })).toBe(false);
    expect(jobCountsAgainstQuota({ status: "failed", bookId: "bk_1" })).toBe(true);
    expect(jobCountsAgainstQuota({ status: "done", bookId: "bk_1" })).toBe(true);
    expect(jobCountsAgainstQuota({ status: "running" })).toBe(true);

    await data.repo.createJob({ ownerId: parent.id, kind: "wizard", status: "failed", bookId: "bk_1" });
    const quota = await getQuotaState(data.repo, parent, 1);
    expect(quota.used).toBe(1);
    expect(quota.blocked).toBe("weekly");
  });
});

describe("daily story after a crash", () => {
  const deps = () => ({ repo: data.repo, media: data.media, text: mockTextProvider, image: mockImageProvider });
  // The trigger arrives after the job has been silent for longer than STALE_JOB_MS.
  const trigger = () => new Date(Date.now() + STALE_JOB_MS + 60_000);
  const deadJob = (day: string, extra: { bookId?: string } = {}) =>
    data.repo.createJob({ ownerId: "system", kind: "daily", status: "running", input: { day }, ...extra });

  it("is still skipped while the day's job is alive", async () => {
    const now = new Date();
    const alive = await deadJob(israelDay(now));
    const started = await startDailyStory(deps(), { now });
    expect(started.skipped).toBe(true);
    expect(started.job.id).toBe(alive.id);
    expect((await data.repo.getJob(alive.id))!.status).toBe("running");
  });

  it("starts again when the day's job died before saving a book", async () => {
    const now = trigger();
    const dead = await deadJob(israelDay(now));

    const started = await startDailyStory(deps(), { now });
    expect(started.skipped).toBe(false);
    expect(started.job.id).not.toBe(dead.id);
    expect((await data.repo.getJob(dead.id))!.status).toBe("failed");
  });

  it("does not reap a job this process is still running", async () => {
    const now = trigger();
    const running = await deadJob(israelDay(now));

    const started = await startDailyStory(deps(), { now, isRunningHere: (id) => id === running.id });
    expect(started.skipped).toBe(true);
    expect((await data.repo.getJob(running.id))!.status).toBe("running");
  });

  it("skips, and closes the job as done, when the dead job had already saved the day's book", async () => {
    const now = trigger();
    const book = await data.repo.createBook({ title: "הסיפור היומי", ownerId: "system", origin: "ai", status: "pending" });
    const dead = await deadJob(israelDay(now), { bookId: book.id });

    const started = await startDailyStory(deps(), { now });
    expect(started.skipped).toBe(true);
    expect(started.job.id).toBe(dead.id);
    expect(started.job.status).toBe("done");
    expect((await data.repo.listJobs({ kind: "daily" })).length).toBe(1);
  });
});
