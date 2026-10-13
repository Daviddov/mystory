/** Test helper: an isolated data directory with its own LocalRepository and LocalMediaStore. */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalMediaStore } from "@/lib/media/local";
import { LocalRepository } from "@/lib/repo/local";

export interface TempData {
  dir: string;
  repo: LocalRepository;
  media: LocalMediaStore;
  /** Deletes the directory. Call it in afterEach. */
  cleanup: () => Promise<void>;
}

/**
 * Creates a fresh temp data dir. Pass `setEnv: true` to also point DATA_DIR at
 * it, so code calling getRepo() / getMediaStore() uses it too (restored by cleanup).
 */
export async function createTempData(options: { setEnv?: boolean } = {}): Promise<TempData> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mystory-test-"));
  const previous = process.env.DATA_DIR;
  if (options.setEnv) process.env.DATA_DIR = dir;
  return {
    dir,
    repo: new LocalRepository(dir),
    media: new LocalMediaStore(dir),
    cleanup: async () => {
      if (options.setEnv) {
        if (previous === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = previous;
      }
      await rm(dir, { recursive: true, force: true });
    },
  };
}
