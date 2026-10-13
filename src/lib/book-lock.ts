/**
 * One lock per book for every read-modify-write of its content: studio saves,
 * the narration pipeline and the editors' review all take it, so a check
 * ("is this still the version the client saw?") and the write that follows
 * cannot be interleaved with another writer.
 *
 * In-process only. With several server instances the same check can still
 * race between instances; the window is the few milliseconds between the read
 * and the write, not the minutes a stale browser tab stays open.
 */

interface LockGlobal {
  __mystoryBookLocks?: Map<string, Promise<unknown>>;
}
const lockGlobal = globalThis as unknown as LockGlobal;

/** Runs `task` after every earlier task of the same book has settled. Not re-entrant. */
export function withBookLock<T>(bookId: string, task: () => Promise<T>): Promise<T> {
  const locks = (lockGlobal.__mystoryBookLocks ??= new Map());
  const previous = locks.get(bookId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => undefined);
  locks.set(bookId, settled);
  void settled.then(() => {
    if (locks.get(bookId) === settled) locks.delete(bookId);
  });
  return run;
}
