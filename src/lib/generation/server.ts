/**
 * Server wiring of the story pipeline: real repository, media store and AI
 * providers (each falls back to its mock when not configured), the weekly
 * quota, and job lookup for the polling endpoint. Server only.
 */
import "server-only";
import { getAiStatus, getImageProvider, getTextProvider } from "../ai";
import { aiWeeklyQuota } from "../config";
import { getMediaStore } from "../media";
import { getRepo } from "../repo";
import type { GenerationJob, User } from "../types";
import { startDailyStory, type DailyStart } from "./daily";
import { jobInputRecord, type WizardInput } from "./input";
import type { EphemeralPhoto } from "./photo";
import { GENERATION_STEPS, runGeneration, type PipelineDeps, type PipelineResult } from "./pipeline";
import { getQuotaState, quotaMessage, type QuotaBlock, type QuotaState } from "./quota";
import { isJobStale, settleStaleJob } from "./stale";

// --- In-process bookkeeping ----------------------------------------------------------

interface GenerationGlobal {
  __mystoryGeneration?: { running: Set<string>; locks: Map<string, Promise<unknown>> };
}
const globalRef = globalThis as unknown as GenerationGlobal;
const state = (globalRef.__mystoryGeneration ??= { running: new Set(), locks: new Map() });

/** Serializes "check quota, then create job" per user, so two fast clicks cannot both pass. */
async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = state.locks.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(fn);
  state.locks.set(userId, current);
  try {
    return await current;
  } finally {
    if (state.locks.get(userId) === current) state.locks.delete(userId);
  }
}

// --- Dependencies -------------------------------------------------------------------------

/**
 * The narration pipeline belongs to another module and may be absent or
 * broken; generation must work without it.
 */
async function loadNarrate(): Promise<PipelineDeps["narrate"]> {
  try {
    const mod: { narrateBook?: (bookId: string) => Promise<unknown> } = await import("../narration");
    return typeof mod.narrateBook === "function" ? (bookId) => mod.narrateBook!(bookId) : undefined;
  } catch {
    return undefined;
  }
}

export async function getPipelineDeps(): Promise<PipelineDeps & { repo: Awaited<ReturnType<typeof getRepo>> }> {
  const [repo, media, text, image, narrate] = await Promise.all([
    getRepo(),
    getMediaStore(),
    getTextProvider(),
    getImageProvider(),
    loadNarrate(),
  ]);
  return { repo, media, text, image, narrate, log: (message) => console.info(message) };
}

// --- Quota -----------------------------------------------------------------------------------

export class QuotaError extends Error {
  constructor(
    readonly block: QuotaBlock,
    readonly quota: QuotaState,
  ) {
    super(quotaMessage(quota));
    this.name = "QuotaError";
  }
}

export async function getUserQuota(user: Pick<User, "id" | "role">): Promise<QuotaState> {
  const repo = await getRepo();
  return reapIfStale(await getQuotaState(repo, user, aiWeeklyQuota()), user);
}

async function reapIfStale(quota: QuotaState, user: Pick<User, "id" | "role">): Promise<QuotaState> {
  if (!quota.activeJob || !isStale(quota.activeJob)) return quota;
  await failStaleJob(quota.activeJob);
  return getQuotaState(await getRepo(), user, aiWeeklyQuota());
}

const isRunningHere = (jobId: string) => state.running.has(jobId);

function isStale(job: GenerationJob): boolean {
  return isJobStale(job, isRunningHere);
}

/** 'done' when the dead job had already saved its book, otherwise 'failed'. */
async function failStaleJob(job: GenerationJob): Promise<GenerationJob> {
  return settleStaleJob(await getRepo(), job);
}

// --- Starting jobs ------------------------------------------------------------------------------

export interface StartedJob {
  job: GenerationJob;
  /** Runs the pipeline to the end. Never throws. Call it from `after()`. */
  run: () => Promise<PipelineResult | null>;
}

function tracked(jobId: string, photo: EphemeralPhoto | null, run: () => Promise<PipelineResult>): StartedJob["run"] {
  state.running.add(jobId);
  return async () => {
    try {
      return await run();
    } catch (err) {
      console.error(`[generation ${jobId}] crashed: ${err instanceof Error ? err.name : "error"}`);
      try {
        const repo = await getRepo();
        await repo.updateJob(jobId, { status: "failed", step: "failed", error: "משהו השתבש. נסו שוב בעוד רגע." });
      } catch {
        // the job record itself is gone; nothing left to update
      }
      return null;
    } finally {
      photo?.discard();
      state.running.delete(jobId);
    }
  };
}

/**
 * Checks the quota and creates the job. Throws QuotaError when the user may
 * not start a generation now. The photo (if any) stays in memory and is passed
 * straight to the pipeline; only `hadPhoto: true` is recorded on the job.
 */
export async function startWizardJob(
  user: Pick<User, "id" | "role">,
  input: WizardInput,
  photo: EphemeralPhoto | null,
): Promise<StartedJob> {
  let deps: Awaited<ReturnType<typeof getPipelineDeps>>;
  let job: GenerationJob;
  try {
    deps = await getPipelineDeps();
    const repo = deps.repo;
    job = await withUserLock(user.id, async () => {
      const quota = await reapIfStale(await getQuotaState(repo, user, aiWeeklyQuota()), user);
      if (quota.blocked) throw new QuotaError(quota.blocked, quota);
      return repo.createJob({
        ownerId: user.id,
        kind: "wizard",
        input: jobInputRecord(input, photo !== null),
        message: "הספר ממתין בתור",
      });
    });
  } catch (err) {
    // No job will run, so the photo has no further use.
    photo?.discard();
    throw err;
  }
  return {
    job,
    run: tracked(job.id, photo, () => runGeneration(deps, { jobId: job.id, ownerId: user.id, input, photo })),
  };
}

export async function startDailyJob(options: { force?: boolean } = {}): Promise<DailyStart> {
  const deps = await getPipelineDeps();
  const started = await startDailyStory(deps, { ...options, isRunningHere });
  if (started.skipped) return started;
  const run = tracked(started.job.id, null, started.run);
  return { ...started, run: async () => (await run()) ?? { job: started.job, book: null } };
}

// --- Reading jobs ----------------------------------------------------------------------------------

/** What the wizard's progress screen receives. Contains no wizard input. */
export interface JobView {
  id: string;
  status: GenerationJob["status"];
  step: string;
  progress: number;
  message: string;
  error?: string;
  usedMock: boolean;
  /** Which services were demo placeholders when this was read. */
  mock: { text: boolean; image: boolean; tts: boolean; nikud: boolean };
  book?: { id: string; slug: string; title: string; coverImage: string; updatedAt: string; pageCount: number };
}

export const JOB_STEPS = GENERATION_STEPS.map(({ step, label }) => ({ step, label }));

/** Returns null when the job does not exist or belongs to someone else (admins may read any job). */
export async function getJobView(jobId: string, user: Pick<User, "id" | "role">): Promise<JobView | null> {
  const repo = await getRepo();
  let job = await repo.getJob(jobId);
  if (!job) return null;
  if (job.ownerId !== user.id && user.role !== "admin") return null;
  if (isStale(job)) job = await failStaleJob(job);

  const ai = getAiStatus();
  const view: JobView = {
    id: job.id,
    status: job.status,
    step: job.step,
    progress: job.progress,
    message: job.message ?? "",
    ...(job.error ? { error: job.error } : {}),
    usedMock: job.usedMock ?? false,
    mock: { text: ai.text.isMock, image: ai.image.isMock, tts: ai.tts.isMock, nikud: ai.nikud.isMock },
  };
  if (job.status === "done" && job.bookId) {
    const book = await repo.getBookById(job.bookId);
    if (book) {
      view.book = {
        id: book.id,
        slug: book.slug,
        title: book.title,
        coverImage: book.coverImage,
        updatedAt: book.updatedAt,
        pageCount: book.pages.length,
      };
    }
  }
  return view;
}
