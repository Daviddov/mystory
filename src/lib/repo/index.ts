/**
 * Data access entry point. Server only (uses the filesystem).
 *
 *   const repo = await getRepo();
 *   const { books } = await repo.listBooks({ ageGroup: "3-5", sort: "popular" });
 */
import "server-only";
import { dataDir, isSupabaseConfigured } from "../config";
import { withLibraryRevalidation } from "../library-cache";
import { LocalRepository } from "./local";
import type { Repository } from "./types";

export * from "./types";
export { LocalRepository } from "./local";

interface RepoGlobal {
  __mystoryRepo?: { key: string; repo: Promise<Repository> };
}

const globalRef = globalThis as unknown as RepoGlobal;

/**
 * In development the cached instance outlives hot reloads, so an edit of
 * local.ts would keep running the old code until a restart. The class source
 * is part of the cache key there; bundles with the same code share one instance.
 */
let devVersionCache: string | undefined;
function devVersion(): string {
  if (process.env.NODE_ENV !== "development") return "";
  if (devVersionCache !== undefined) return devVersionCache;
  const source = String(LocalRepository);
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) | 0;
  devVersionCache = String(hash);
  return devVersionCache;
}

/**
 * Returns the process-wide repository: Supabase when its env vars are set,
 * otherwise the local JSON repository under dataDir(). The instance is cached
 * on globalThis so every bundle shares one write mutex. Library writes
 * revalidate the cached public pages (src/lib/library-cache.ts).
 */
export function getRepo(): Promise<Repository> {
  const key = isSupabaseConfigured() ? "supabase" : `local:${dataDir()}:${devVersion()}`;
  const cached = globalRef.__mystoryRepo;
  if (cached && cached.key === key) return cached.repo;

  // Writes that change the public library clear the cached library pages.
  const repo: Promise<Repository> = (
    isSupabaseConfigured()
      ? import("./supabase").then((mod) => mod.createSupabaseRepository())
      : Promise.resolve(new LocalRepository(dataDir()))
  ).then(withLibraryRevalidation);
  globalRef.__mystoryRepo = { key, repo };
  repo.catch(() => {
    if (globalRef.__mystoryRepo?.repo === repo) globalRef.__mystoryRepo = undefined;
  });
  return repo;
}
