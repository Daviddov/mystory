import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/types";
import { ConflictError, NotFoundError } from "@/lib/repo/types";
import type { Page } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";
import { CollectionCreateSchema, CollectionUpdateSchema, ReviewInputSchema } from "./schemas";
import {
  changeUserRole,
  computeTaxonomyUsage,
  createCollection,
  deleteBookAndMedia,
  getDashboardStats,
  missingPublishCredits,
  publishBlockers,
  reviewBook,
  setBookOfTheWeek,
  setBookStatus,
  updateCollection,
} from "./service";

const PAGES: Page[] = [{ index: 0, text: "היה היה שבלול קטן." }];

let data: TempData;

beforeEach(async () => {
  data = await createTempData();
});
afterEach(async () => {
  await data.cleanup();
});

function makeBook(overrides: Record<string, unknown> = {}) {
  return data.repo.createBook({
    title: "ספר בדיקה",
    ownerId: "u_owner",
    license: "CC BY 4.0",
    source: "נכתב לאתר",
    status: "pending",
    pages: PAGES,
    ...overrides,
  });
}

describe("publishBlockers", () => {
  it("requires only a page and a title", () => {
    expect(publishBlockers({ pages: PAGES, title: "ספר" })).toEqual([]);
    expect(publishBlockers({ pages: [], title: " " })).toHaveLength(2);
  });
});

describe("missing details", () => {
  const complete = { license: "CC BY 4.0", source: "x" };
  const translated = { ...complete, language: "he" as const, originalLanguage: "en" as const };

  it("lists a missing license, source, translator and a book that is not in Hebrew", () => {
    expect(missingPublishCredits(complete)).toEqual([]);
    expect(missingPublishCredits({ license: " ", source: " " })).toHaveLength(2);
    expect(missingPublishCredits(translated)).toHaveLength(1);
    expect(missingPublishCredits({ ...translated, credits: { translator: "דנה" } })).toEqual([]);
    expect(missingPublishCredits({ ...complete, language: "en" }).join(" ")).toMatch(/לא בעברית/);
  });

  it("blocks an editor, and an admin who did not confirm", async () => {
    const book = await makeBook(translated);
    await expect(reviewBook(data.repo, book.id, { action: "approve" })).rejects.toBeInstanceOf(ConflictError);
    await expect(
      reviewBook(data.repo, book.id, { action: "approve", waiveCredits: true }, { canWaiveCredits: false }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      reviewBook(data.repo, book.id, { action: "approve" }, { canWaiveCredits: true }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      setBookStatus(data.repo, book.id, "published", {
        waiveCredits: true,
        canWaiveCredits: false,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets an admin publish anyway, from the queue and from the books table", async () => {
    const queued = await makeBook(translated);
    const approved = await reviewBook(
      data.repo,
      queued.id,
      { action: "approve", waiveCredits: true },
      { canWaiveCredits: true },
    );
    expect(approved.book.status).toBe("published");

    const draft = await makeBook({
      ...translated,
      status: "draft",
      source: "",
    });
    const published = await setBookStatus(data.repo, draft.id, "published", {
      waiveCredits: true,
      canWaiveCredits: true,
    });
    expect(published.book.status).toBe("published");
  });

  it("lets an admin publish a book in English with no license", async () => {
    const english = await makeBook({ status: "draft", language: "en", originalLanguage: "en", license: "" });
    await expect(setBookStatus(data.repo, english.id, "published")).rejects.toBeInstanceOf(ConflictError);
    const published = await setBookStatus(data.repo, english.id, "published", {
      waiveCredits: true,
      canWaiveCredits: true,
    });
    expect(published.book.status).toBe("published");
  });

  it("does not waive the hard requirements: a page and a title", async () => {
    const admin = { waiveCredits: true, canWaiveCredits: true };
    const empty = await makeBook({ status: "draft", pages: [] });
    await expect(setBookStatus(data.repo, empty.id, "published", admin)).rejects.toBeInstanceOf(ConflictError);
    const untitled = await makeBook({ status: "draft", title: " " });
    await expect(setBookStatus(data.repo, untitled.id, "published", admin)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("reviewBook", () => {
  it("approve publishes, sets publishedAt and clears an old review note", async () => {
    const book = await makeBook({ reviewNote: "הערה ישנה" });
    const { book: updated } = await reviewBook(data.repo, book.id, {
      action: "approve",
    });
    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toBeTruthy();
    expect(updated.reviewNote).toBeUndefined();
    const { books } = await data.repo.listBooks();
    expect(books.map((b) => b.id)).toContain(book.id);
  });

  it("reject sends the book back to private with the note", async () => {
    const book = await makeBook();
    const { book: updated } = await reviewBook(data.repo, book.id, {
      action: "reject",
      note: "חסר איור בעמוד 2",
    });
    expect(updated.status).toBe("private");
    expect(updated.reviewNote).toBe("חסר איור בעמוד 2");
    expect(updated.publishedAt).toBeUndefined();
  });

  it("refuses a book that is not pending", async () => {
    const book = await makeBook({ status: "private" });
    await expect(reviewBook(data.repo, book.id, { action: "approve" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to approve a book without a license", async () => {
    const book = await makeBook({ license: "" });
    await expect(reviewBook(data.repo, book.id, { action: "approve" })).rejects.toBeInstanceOf(ConflictError);
    expect((await data.repo.getBookById(book.id))?.status).toBe("pending");
  });

  it("throws NotFoundError for a missing book", async () => {
    await expect(reviewBook(data.repo, "missing", { action: "approve" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the schema requires a note for reject", () => {
    expect(ReviewInputSchema.safeParse({ action: "reject" }).success).toBe(false);
    expect(ReviewInputSchema.safeParse({ action: "reject", note: "  " }).success).toBe(false);
    expect(ReviewInputSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(ReviewInputSchema.safeParse({ action: "delete" }).success).toBe(false);
  });
});

describe("setBookStatus", () => {
  it("unpublishing clears the book of the week", async () => {
    const book = await makeBook({ status: "published" });
    await setBookOfTheWeek(data.repo, book.id);
    const result = await setBookStatus(data.repo, book.id, "private");
    expect(result.book.status).toBe("private");
    expect(result.clearedBookOfTheWeek).toBe(true);
    expect((await data.repo.getSettings()).bookOfTheWeekId).toBeUndefined();
  });

  it("refuses to publish a book without pages", async () => {
    const book = await makeBook({ status: "draft", pages: [] });
    await expect(setBookStatus(data.repo, book.id, "published")).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps the original publishedAt when a book is published again", async () => {
    const book = await makeBook({ status: "draft" });
    const first = await setBookStatus(data.repo, book.id, "published");
    await setBookStatus(data.repo, book.id, "draft");
    const second = await setBookStatus(data.repo, book.id, "published");
    expect(second.book.publishedAt).toBe(first.book.publishedAt);
  });
});

describe("deleteBookAndMedia", () => {
  it("removes the book and its media", async () => {
    const book = await makeBook();
    await data.media.put(`books/${book.id}/cover.svg`, new TextEncoder().encode("<svg/>"), "image/svg+xml");
    const result = await deleteBookAndMedia(data.repo, data.media, book.id);
    expect(result.mediaDeleted).toBe(true);
    expect(await data.repo.getBookById(book.id)).toBeNull();
    expect(await data.media.list(`books/${book.id}`)).toEqual([]);
  });

  it("reports a media failure instead of hiding it", async () => {
    const book = await makeBook();
    const broken = {
      deletePrefix: async () => {
        throw new Error("disk error");
      },
    };
    const result = await deleteBookAndMedia(data.repo, broken, book.id);
    expect(result.mediaDeleted).toBe(false);
    expect(await data.repo.getBookById(book.id)).toBeNull();
  });

  it("throws NotFoundError for a missing book", async () => {
    await expect(deleteBookAndMedia(data.repo, data.media, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("collections", () => {
  it("creates, reorders, changes and removes the season", async () => {
    const a = await makeBook({ title: "א", status: "published" });
    const b = await makeBook({ title: "ב", status: "published" });
    const created = await createCollection(
      data.repo,
      CollectionCreateSchema.parse({
        title: "ימי גשם",
        season: "winter",
        bookIds: [a.id, b.id],
      }),
    );
    expect(created.season).toBe("winter");
    expect(created.bookIds).toEqual([a.id, b.id]);
    expect(created.slug).toBeTruthy();

    const reordered = await updateCollection(
      data.repo,
      created.id,
      CollectionUpdateSchema.parse({ bookIds: [b.id, a.id] }),
    );
    expect(reordered.bookIds).toEqual([b.id, a.id]);
    expect(reordered.season).toBe("winter");

    const cleared = await updateCollection(data.repo, created.id, CollectionUpdateSchema.parse({ season: null }));
    expect(cleared.season).toBeUndefined();
    expect((await data.repo.getCollectionById(created.id))?.season).toBeUndefined();
  });

  it("refuses unknown book ids and duplicates", async () => {
    await expect(
      createCollection(data.repo, CollectionCreateSchema.parse({ title: "אוסף", bookIds: ["nope"] })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(CollectionCreateSchema.safeParse({ title: "אוסף", bookIds: ["a", "a"] }).success).toBe(false);
    expect(CollectionCreateSchema.safeParse({ title: "אוסף", season: "Winter!" }).success).toBe(false);
  });
});

describe("setBookOfTheWeek", () => {
  it("accepts only a published book and can be cleared", async () => {
    const pending = await makeBook();
    await expect(setBookOfTheWeek(data.repo, pending.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(setBookOfTheWeek(data.repo, "missing")).rejects.toBeInstanceOf(NotFoundError);

    const published = await makeBook({ title: "מפורסם", status: "published" });
    expect((await setBookOfTheWeek(data.repo, published.id)).bookOfTheWeekId).toBe(published.id);
    expect((await setBookOfTheWeek(data.repo, null)).bookOfTheWeekId).toBeUndefined();
  });
});

describe("changeUserRole", () => {
  it("lets an admin promote and demote other users", async () => {
    const admin = await data.repo.upsertUser({
      name: "מנהלת",
      email: "admin@example.com",
      role: "admin",
    });
    const parent = await data.repo.upsertUser({
      name: "הורה",
      email: "parent@example.com",
    });
    expect((await changeUserRole(data.repo, admin, parent.id, "editor", [])).role).toBe("editor");
    expect((await data.repo.getUser(parent.id))?.role).toBe("editor");
  });

  it("refuses editors, self changes and ADMIN_EMAILS users", async () => {
    const admin = await data.repo.upsertUser({
      name: "מנהלת",
      email: "admin@example.com",
      role: "admin",
    });
    const editor = await data.repo.upsertUser({
      name: "עורך",
      email: "editor@example.com",
      role: "editor",
    });
    const boss = await data.repo.upsertUser({
      name: "בעלים",
      email: "Boss@example.com",
      role: "admin",
    });

    await expect(changeUserRole(data.repo, editor, admin.id, "parent", [])).rejects.toBeInstanceOf(AuthError);
    await expect(changeUserRole(data.repo, admin, admin.id, "parent", [])).rejects.toBeInstanceOf(ConflictError);
    await expect(changeUserRole(data.repo, admin, boss.id, "parent", ["boss@example.com"])).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(changeUserRole(data.repo, admin, "u_missing", "editor", [])).rejects.toBeInstanceOf(NotFoundError);
    expect((await data.repo.getUser(admin.id))?.role).toBe("admin");
  });
});

describe("getDashboardStats", () => {
  it("counts books by status, ranks views and sums this week's generations", async () => {
    const top = await makeBook({
      title: "פופולרי",
      status: "published",
      viewCount: 50,
    });
    await makeBook({ title: "פחות", status: "published", viewCount: 5 });
    await makeBook({ title: "ממתין", viewCount: 999 });
    await makeBook({ title: "טיוטה", status: "draft", origin: "ai" });
    await data.repo.createJob({
      ownerId: "u1",
      status: "done",
      kind: "wizard",
      usedMock: true,
      costUsd: 0.5,
    });
    await data.repo.createJob({
      ownerId: "u1",
      status: "failed",
      kind: "daily",
    });

    const stats = await getDashboardStats(data.repo);
    expect(stats.totalBooks).toBe(4);
    expect(stats.byStatus).toEqual({
      draft: 1,
      private: 0,
      pending: 1,
      published: 2,
    });
    expect(stats.byOrigin.ai).toBe(1);
    expect(stats.mostViewed.map((b) => b.id)[0]).toBe(top.id);
    expect(stats.mostViewed).toHaveLength(2);
    expect(stats.generations.total).toBe(2);
    expect(stats.generations.byStatus.done).toBe(1);
    expect(stats.generations.byStatus.failed).toBe(1);
    expect(stats.generations.daily).toBe(1);
    expect(stats.generations.usedMock).toBe(1);
    expect(stats.generations.costUsd).toBeCloseTo(0.5);

    // Eight days later the jobs are outside the window.
    const later = await getDashboardStats(data.repo, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    expect(later.generations.total).toBe(0);
  });
});

describe("computeTaxonomyUsage", () => {
  it("counts tags and themes, lists unused themes and flags unknown slugs", async () => {
    await makeBook({
      title: "א",
      status: "published",
      tags: ["חתולים", "חתולים"],
      themes: ["courage"],
      categories: ["animals"],
    });
    await makeBook({
      title: "ב",
      tags: ["חתולים", "תגית-שלא-קיימת"],
      themes: ["made-up"],
      categories: [],
    });
    const { books } = await data.repo.listBooks({ status: "any" });
    const usage = computeTaxonomyUsage(books);

    const cats = usage.tags.find((t) => t.key === "חתולים");
    expect(cats).toMatchObject({ total: 2, published: 1 });
    expect(usage.tags.find((t) => t.key === "תגית-שלא-קיימת")?.known).toBe(false);
    expect(usage.themes.find((t) => t.key === "courage")).toMatchObject({
      total: 1,
      published: 1,
      known: true,
    });
    expect(usage.themes.find((t) => t.key === "made-up")).toMatchObject({
      total: 1,
      known: false,
    });
    expect(usage.themes.find((t) => t.key === "kindness")?.total).toBe(0);
    expect(usage.withoutCategory).toBe(1);
    expect(usage.untagged).toBe(0);
  });
});
