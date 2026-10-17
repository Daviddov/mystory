import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import { ConflictError, NotFoundError } from "./types";

let data: TempData;

beforeEach(async () => {
  data = await createTempData();
});

afterEach(async () => {
  await data.cleanup();
});

describe("LocalRepository books", () => {
  it("creates a draft with defaults and stores it under its slug", async () => {
    const book = await data.repo.createBook({
      title: "הדרקון הקטן",
      ownerId: "u_1",
      pages: [
        { index: 7, text: "עמוד ראשון" },
        { index: 3, text: "עמוד שני" },
      ],
    });
    expect(book.status).toBe("draft");
    expect(book.origin).toBe("manual");
    expect(book.slug).toMatch(/^[a-z0-9-]+$/);
    expect(book.pages.map((p) => p.index)).toEqual([0, 1]);
    expect(await readdir(path.join(data.dir, "books"))).toEqual([book.slug]);
    expect(await data.repo.getBookBySlug(book.slug)).toEqual(book);
    expect(await data.repo.getBookById(book.id)).toEqual(book);
  });

  it("keeps slugs unique", async () => {
    const first = await data.repo.createBook({ title: "Same", ownerId: "u_1", slug: "same" });
    const second = await data.repo.createBook({ title: "Same", ownerId: "u_1", slug: "same" });
    expect(first.slug).toBe("same");
    expect(second.slug).toBe("same-2");
    await expect(data.repo.updateBook(second.id, { slug: "same" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("lists only published books by default and filters", async () => {
    const pub = await data.repo.createBook({
      title: "חתול בגשם",
      ownerId: "u_1",
      status: "published",
      ageGroup: "3-5",
      categories: ["animals"],
      tags: ["גן ילדים"],
      themes: ["courage"],
      readingMinutes: 7,
    });
    await data.repo.createBook({ title: "טיוטה", ownerId: "u_2" });

    expect((await data.repo.listBooks()).books.map((b) => b.id)).toEqual([pub.id]);
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(2);
    expect((await data.repo.listBooks({ status: "draft", ownerId: "u_2" })).total).toBe(1);
    expect((await data.repo.listBooks({ category: "animals" })).total).toBe(1);
    expect((await data.repo.listBooks({ category: "humor" })).total).toBe(0);
    expect((await data.repo.listBooks({ tag: "גן-ילדים" })).total).toBe(1);
    expect((await data.repo.listBooks({ theme: "courage", ageGroup: "3-5", timeBucket: "10" })).total).toBe(1);
    expect((await data.repo.listBooks({ timeBucket: "5" })).total).toBe(0);
    expect((await data.repo.listBooks({ query: "חָתוּל" })).total).toBe(1);
    expect((await data.repo.listBooks({ query: "כלב" })).total).toBe(0);
    expect((await data.repo.listBooks())?.books[0]).not.toHaveProperty("pages");
  });

  it("sorts by popularity and paginates", async () => {
    const a = await data.repo.createBook({ title: "A", ownerId: "u", status: "published", slug: "a" });
    const b = await data.repo.createBook({ title: "B", ownerId: "u", status: "published", slug: "b" });
    await data.repo.incrementViews(b.id);
    expect(await data.repo.incrementViews(b.id)).toBe(2);
    const popular = await data.repo.listBooks({ sort: "popular" });
    expect(popular.books.map((x) => x.id)).toEqual([b.id, a.id]);
    const page = await data.repo.listBooks({ sort: "popular", limit: 1, offset: 1 });
    expect(page.total).toBe(2);
    expect(page.books.map((x) => x.id)).toEqual([a.id]);
  });

  it("updates, renames, shares and replaces pages", async () => {
    const book = await data.repo.createBook({ title: "ספר", ownerId: "u", slug: "old-name" });
    const updated = await data.repo.updateBook(book.id, {
      slug: "new-name",
      status: "published",
      shareToken: "tok123",
    });
    expect(updated.slug).toBe("new-name");
    expect(updated.publishedAt).toBeTruthy();
    expect(await data.repo.getBookBySlug("old-name")).toBeNull();
    expect((await data.repo.getBookByShareToken("tok123"))?.id).toBe(book.id);

    const cleared = await data.repo.updateBook(book.id, { shareToken: undefined });
    expect(cleared.shareToken).toBeUndefined();
    expect(await data.repo.getBookByShareToken("tok123")).toBeNull();

    const withPages = await data.repo.replacePages(book.id, [{ index: 0, text: "א" }, { index: 0, text: "ב" }]);
    expect(withPages.pages.map((p) => [p.index, p.text])).toEqual([[0, "א"], [1, "ב"]]);
    await expect(data.repo.updateBook("missing", { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects invalid data and unsafe slugs", async () => {
    await expect(data.repo.createBook({ title: "x", ownerId: "u", slug: "../evil" })).rejects.toThrow();
    expect(await data.repo.getBookBySlug("../evil")).toBeNull();
  });

  it("deletes a book with everything that points at it", async () => {
    const book = await data.repo.createBook({ title: "ספר", ownerId: "u", status: "published" });
    await data.repo.addFavorite("u", book.id);
    await data.repo.setProgress("u", book.id, 2);
    const collection = await data.repo.createCollection({ title: "אוסף", description: "", bookIds: [book.id] });
    await data.repo.setSettings({ bookOfTheWeekId: book.id });

    await data.repo.deleteBook(book.id);
    await data.repo.deleteBook(book.id);

    expect(await data.repo.getBookById(book.id)).toBeNull();
    expect(await data.repo.listFavorites("u")).toEqual([]);
    expect(await data.repo.listProgress("u")).toEqual([]);
    expect((await data.repo.getCollectionById(collection.id))?.bookIds).toEqual([]);
    expect((await data.repo.getSettings()).bookOfTheWeekId).toBeUndefined();
  });

  it("survives concurrent writes", async () => {
    const book = await data.repo.createBook({ title: "ספר", ownerId: "u" });
    await Promise.all(Array.from({ length: 20 }, () => data.repo.incrementViews(book.id)));
    expect((await data.repo.getBookById(book.id))?.viewCount).toBe(20);
  });

  it("sees a change made while reads are running, and files edited outside it", async () => {
    const book = await data.repo.createBook({ title: "לפני", ownerId: "u", status: "published", slug: "seen" });
    const [, , updated] = await Promise.all([
      data.repo.listBooks(),
      data.repo.getBookBySlug("seen"),
      data.repo.updateBook(book.id, { title: "אחרי" }),
      data.repo.listBooks(),
    ]);
    expect(updated.title).toBe("אחרי");
    expect((await data.repo.listBooks()).books.map((b) => b.title)).toEqual(["אחרי"]);

    const file = path.join(data.dir, "books", "seen", "book.json");
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...onDisk, title: "נערך ביד" }));
    expect((await data.repo.getBookBySlug("seen"))?.title).toBe("נערך ביד");
  });
});

describe("LocalRepository users, favorites, progress, jobs", () => {
  it("upserts users by email and changes roles", async () => {
    const first = await data.repo.upsertUser({ name: "דנה", email: "Dana@Example.com" });
    const again = await data.repo.upsertUser({ name: "דנה ל", email: "dana@example.com" });
    expect(again.id).toBe(first.id);
    expect(again.role).toBe("parent");
    expect((await data.repo.setUserRole(first.id, "editor")).role).toBe("editor");
    expect((await data.repo.upsertUser({ name: "דנה", email: "dana@example.com" })).role).toBe("editor");
    expect((await data.repo.getUserByEmail("DANA@example.com"))?.id).toBe(first.id);
    expect(await data.repo.listUsers()).toHaveLength(1);
  });

  it("tracks favorites and progress per user", async () => {
    await data.repo.addFavorite("u1", "b1");
    await data.repo.addFavorite("u1", "b1");
    await data.repo.addFavorite("u2", "b1");
    expect(await data.repo.listFavorites("u1")).toHaveLength(1);
    expect(await data.repo.isFavorite("u1", "b1")).toBe(true);
    await data.repo.removeFavorite("u1", "b1");
    expect(await data.repo.isFavorite("u1", "b1")).toBe(false);
    expect(await data.repo.isFavorite("u2", "b1")).toBe(true);

    expect(await data.repo.getProgress("u1", "b1")).toBeNull();
    await data.repo.setProgress("u1", "b1", 3, true);
    const progress = await data.repo.setProgress("u1", "b1", 4);
    expect(progress).toMatchObject({ pageIndex: 4, completed: true });
  });

  it("counts weekly generations, ignoring failed and old jobs", async () => {
    const job = await data.repo.createJob({ ownerId: "u1" });
    expect(job).toMatchObject({ status: "queued", progress: 0 });
    const failed = await data.repo.createJob({ ownerId: "u1" });
    await data.repo.updateJob(failed.id, { status: "failed", error: "boom" });
    await data.repo.createJob({ ownerId: "u2" });

    expect(await data.repo.countWeeklyGenerations("u1")).toBe(1);
    expect(await data.repo.countWeeklyGenerations("u1", new Date(Date.now() + 60_000))).toBe(0);
    expect(await data.repo.listJobs({ ownerId: "u1" })).toHaveLength(2);
    expect(await data.repo.listJobs({ status: "failed" })).toHaveLength(1);
    await data.repo.deleteJob(job.id);
    expect(await data.repo.getJob(job.id)).toBeNull();
  });
});
