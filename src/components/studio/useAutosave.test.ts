import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioApiError } from "@/lib/studio/client";
import type { BookWithPages } from "@/lib/types";
import { AutosaveQueue, type SaveState } from "./useAutosave";

const book = { id: "bk_1" } as BookWithPages;

function setup(overrides: Partial<{ patchMeta: () => Promise<BookWithPages>; putPages: () => Promise<BookWithPages> }> = {}) {
  const patchMeta = vi.fn(overrides.patchMeta ?? (async () => book));
  const putPages = vi.fn(overrides.putPages ?? (async () => book));
  const queue = new AutosaveQueue("bk_1", { patchMeta, putPages });
  const states: SaveState[] = [];
  queue.listen({ onChange: (snapshot) => void states.push(snapshot.state) });
  return { queue, patchMeta, putPages, states };
}

describe("AutosaveQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces edits into one save and merges metadata patches", async () => {
    const { queue, patchMeta, putPages, states } = setup();
    queue.markMeta({ title: "א" });
    queue.markMeta({ summary: "ב" });
    queue.markPages([{ text: "1" }]);
    queue.markPages([{ text: "2" }]);
    expect(patchMeta).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(patchMeta).toHaveBeenCalledTimes(1);
    expect(patchMeta).toHaveBeenCalledWith("bk_1", { title: "א", summary: "ב" }, undefined);
    expect(putPages).toHaveBeenCalledTimes(1);
    expect(putPages).toHaveBeenCalledWith("bk_1", [{ text: "2" }], undefined);
    expect(states.at(-1)).toBe("saved");
    expect(queue.hasPending).toBe(false);
  });

  it("sends edits made during a save in a second save, in order", async () => {
    let release: (value: BookWithPages) => void = () => {};
    const { queue, putPages, states } = setup({
      putPages: vi
        .fn()
        .mockImplementationOnce(() => new Promise<BookWithPages>((resolve) => (release = resolve)))
        .mockImplementation(async () => book),
    });
    queue.markPages([{ text: "first" }]);
    const first = queue.flush();
    await vi.advanceTimersByTimeAsync(0);
    queue.markPages([{ text: "second" }]);
    expect(states.at(-1)).toBe("saving");
    release(book);
    expect(await first).toBe(true);
    expect(putPages.mock.calls.map((call) => (call as unknown[])[1])).toEqual([[{ text: "first" }], [{ text: "second" }]]);
    expect(states.at(-1)).toBe("saved");
  });

  it("keeps failed data pending, reports the error and retries a network failure", async () => {
    const { queue, putPages, states } = setup({
      putPages: vi
        .fn()
        .mockRejectedValueOnce(new StudioApiError(0, "אין חיבור"))
        .mockImplementation(async () => book),
    });
    queue.markPages([{ text: "x" }]);
    expect(await queue.flush()).toBe(false);
    expect(states.at(-1)).toBe("error");
    expect(queue.hasPending).toBe(true);
    await vi.advanceTimersByTimeAsync(7000);
    expect(putPages).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("saved");
    expect(queue.hasPending).toBe(false);
  });

  it("does not retry a refusal such as a locked book by itself", async () => {
    const { queue, patchMeta } = setup({
      patchMeta: vi.fn().mockRejectedValue(new StudioApiError(409, "נעול")),
    });
    queue.markMeta({ title: "א" });
    expect(await queue.flush()).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(patchMeta).toHaveBeenCalledTimes(1);
    expect(queue.hasPending).toBe(true);
  });

  it("does not resend metadata that was saved when only the pages failed", async () => {
    const { queue, patchMeta, putPages } = setup({
      putPages: vi
        .fn()
        .mockRejectedValueOnce(new StudioApiError(500, "שגיאה"))
        .mockImplementation(async () => book),
    });
    queue.markMeta({ title: "א" });
    queue.markPages([{ text: "x" }]);
    expect(await queue.flush()).toBe(false);
    expect(await queue.flush()).toBe(true);
    expect(patchMeta).toHaveBeenCalledTimes(1);
    expect(putPages).toHaveBeenCalledTimes(2);
  });
});
