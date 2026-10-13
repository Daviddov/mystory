/**
 * Regression test for the "lost edits" review finding, browser side: every
 * save names the version it is based on, and after the server reports that the
 * book changed elsewhere this tab stops sending its stale snapshot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioApiError } from "@/lib/studio/client";
import type { BookWithPages } from "@/lib/types";
import { AutosaveQueue } from "./useAutosave";

const saved = (updatedAt: string) => ({ id: "bk_1", updatedAt }) as BookWithPages;
const staleError = () =>
  new StudioApiError(409, "הספר השתנה במקום אחר", { code: "stale-version", updatedAt: "2026-01-01T00:00:09.000Z" });

describe("AutosaveQueue versions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bases each save on the version the previous one returned", async () => {
    const patchMeta = vi.fn(async () => saved("v2"));
    const putPages = vi
      .fn<(id: string, pages: unknown[], base?: string) => Promise<BookWithPages>>()
      .mockResolvedValueOnce(saved("v3"))
      .mockResolvedValueOnce(saved("v4"));
    const queue = new AutosaveQueue("bk_1", { patchMeta, putPages }, "v1");

    queue.markMeta({ title: "א" });
    queue.markPages([{ text: "1" }]);
    expect(await queue.flush()).toBe(true);
    expect(patchMeta).toHaveBeenCalledWith("bk_1", { title: "א" }, "v1");
    // The pages save follows the metadata save, so it is based on what that one returned.
    expect(putPages).toHaveBeenLastCalledWith("bk_1", [{ text: "1" }], "v2");

    queue.markPages([{ text: "2" }]);
    expect(await queue.flush()).toBe(true);
    expect(putPages).toHaveBeenLastCalledWith("bk_1", [{ text: "2" }], "v3");

    // Another action of this tab changed the book (status, share link, narration).
    queue.setBase("v9");
    queue.markPages([{ text: "3" }]);
    await queue.flush();
    expect(putPages).toHaveBeenLastCalledWith("bk_1", [{ text: "3" }], "v9");
  });

  it("reports a conflict and never sends the stale snapshot again", async () => {
    const putPages = vi.fn().mockRejectedValue(staleError());
    const queue = new AutosaveQueue("bk_1", { patchMeta: vi.fn(), putPages }, "v1");
    const snapshots: { state: string; conflict?: boolean; error: string | null }[] = [];
    queue.listen({ onChange: (snapshot) => void snapshots.push(snapshot) });

    queue.markPages([{ text: "הגרסה הישנה שלי" }]);
    expect(await queue.flush()).toBe(false);
    expect(snapshots.at(-1)).toMatchObject({ state: "error", conflict: true, error: "הספר השתנה במקום אחר" });
    expect(queue.hasConflict).toBe(true);

    // No automatic retry, no save for later edits, and an explicit flush sends nothing either.
    await vi.advanceTimersByTimeAsync(60_000);
    queue.markPages([{ text: "עוד עריכה" }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await queue.flush()).toBe(false);
    expect(putPages).toHaveBeenCalledTimes(1);

    // Before the reload the pending edits are dropped, so the tab closes without a warning.
    queue.discard();
    expect(queue.hasPending).toBe(false);
  });

  it("still treats an ordinary refusal (a locked book) as a plain error, not a conflict", async () => {
    const patchMeta = vi.fn().mockRejectedValue(new StudioApiError(409, "נעול"));
    const queue = new AutosaveQueue("bk_1", { patchMeta, putPages: vi.fn() }, "v1");
    const snapshots: { conflict?: boolean }[] = [];
    queue.listen({ onChange: (snapshot) => void snapshots.push(snapshot) });
    queue.markMeta({ title: "א" });
    expect(await queue.flush()).toBe(false);
    expect(snapshots.at(-1)?.conflict).toBe(false);
    expect(queue.hasConflict).toBe(false);
    expect(new StudioApiError(409, "נעול").conflict).toBe(false);
    expect(staleError().conflict).toBe(true);
  });
});
