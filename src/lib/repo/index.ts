/**
 * Data access entry point. Server only (uses the filesystem).
 *
 *   const repo = await getRepo();
 *   const { books } = await repo.listBooks({ ageGroup: "3-5", sort: "popular" });
 */
import "server-only";
import { dataDir, isSupabaseConfigured } from "../config";
import { LocalRepository } from "./local";
import type { Repository } from "./types";

export * from "./types";
export { LocalRepository } from "./local";

interface RepoGlobal {
  __mystoryRepo?: { key: string; repo: Promise<Repository> };
}

const globalRef = globalThis as unknown as RepoGlobal;

/**
 * Returns the process-wide repository: Supabase when its env vars are set,
 * otherwise the local JSON repository under dataDir(). The instance is cached
 * on globalThis so every bundle shares one write mutex.
 */
export function getRepo(): Promise<Repository> {
  const key = isSupabaseConfigured() ? "supabase" : `local:${dataDir()}`;
  const cached = globalRef.__mystoryRepo;
  if (cached && cached.key === key) return cached.repo;

  const repo: Promise<Repository> = isSupabaseConfigured()
    ? import("./supabase").then((mod) => mod.createSupabaseRepository())
    : Promise.resolve(new LocalRepository(dataDir()));
  globalRef.__mystoryRepo = { key, repo };
  repo.catch(() => {
    if (globalRef.__mystoryRepo?.repo === repo) globalRef.__mystoryRepo = undefined;
  });
  return repo;
}
