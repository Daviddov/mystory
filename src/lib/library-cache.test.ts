import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { revalidateLibrary, withLibraryRevalidation } from "./library-cache";
import { getRepo } from "./repo";
import type { Repository } from "./repo/types";

describe("library cache revalidation", () => {
  let data: TempData;
  let repo: Repository;

  beforeEach(async () => {
    data = await createTempData();
    repo = withLibraryRevalidation(data.repo);
    await data.repo.createBook({ id: "draft-1", slug: "draft", title: "טיוטה", ownerId: "u1", status: "draft" });
    await data.repo.createBook({ id: "pub-1", slug: "pub", title: "פורסם", ownerId: "u1", status: "published" });
    revalidatePath.mockClear();
  });

  afterEach(async () => {
    await data.cleanup();
  });

  const revalidated = () => {
    const count = revalidatePath.mock.calls.length;
    for (const call of revalidatePath.mock.calls) expect(call).toEqual(["/", "layout"]);
    revalidatePath.mockClear();
    return count > 0;
  };

  it("revalidates when a book is published, edited while published, or unpublished", async () => {
    await repo.updateBook("draft-1", { status: "published" });
    expect(revalidated()).toBe(true);
    await repo.updateBook("draft-1", { title: "שם חדש" });
    expect(revalidated()).toBe(true);
    await repo.replacePages("draft-1", [{ index: 0, text: "עמוד" }]);
    expect(revalidated()).toBe(true);
    await repo.updateBook("draft-1", { status: "private" });
    expect(revalidated()).toBe(true);
  });

  it("does not revalidate for edits of a book nobody sees in the library", async () => {
    await repo.updateBook("draft-1", { title: "עדיין טיוטה" });
    await repo.replacePages("draft-1", [{ index: 0, text: "עמוד" }]);
    await repo.createBook({ slug: "another", title: "עוד טיוטה", ownerId: "u1", status: "draft" });
    expect(revalidated()).toBe(false);
  });

  it("revalidates for new published books, deletes, collections and settings", async () => {
    await repo.createBook({ slug: "fresh", title: "חדש", ownerId: "u1", status: "published" });
    expect(revalidated()).toBe(true);
    await repo.deleteBook("pub-1");
    expect(revalidated()).toBe(true);
    const collection = await repo.createCollection({ title: "אוסף", description: "", bookIds: [] });
    expect(revalidated()).toBe(true);
    await repo.updateCollection(collection.id, { title: "אוסף אחר" });
    expect(revalidated()).toBe(true);
    await repo.deleteCollection(collection.id);
    expect(revalidated()).toBe(true);
    await repo.setSettings({ bookOfTheWeekId: "draft-1" });
    expect(revalidated()).toBe(true);
  });

  it("leaves reads and personal data alone", async () => {
    await repo.listBooks({ status: "published" });
    await repo.getBookBySlug("pub");
    await repo.incrementViews("pub-1");
    await repo.upsertUser({ id: "u2", name: "קוראת" });
    await repo.addFavorite("u2", "pub-1");
    expect(revalidated()).toBe(false);
  });

  it("keeps a failed write from revalidating, and survives being called outside a request", async () => {
    await expect(repo.updateBook("missing", { status: "published" })).rejects.toThrow();
    expect(revalidated()).toBe(false);
    revalidatePath.mockImplementationOnce(() => {
      throw new Error("Invariant: static generation store missing in revalidatePath /");
    });
    expect(() => revalidateLibrary()).not.toThrow();
  });

  it("is what getRepo() returns", async () => {
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = data.dir;
    try {
      const appRepo = await getRepo();
      await appRepo.updateBook("draft-1", { status: "published" });
      expect(revalidated()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
    }
  });
});
