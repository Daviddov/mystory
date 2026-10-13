import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { User } from "../types";

const session = vi.hoisted(() => ({ user: null as User | null }));

// The real local auth reads the request cookie; tests set the visitor directly.
vi.mock("@/lib/auth/local", () => ({
  createLocalAuth: () => ({
    kind: "local",
    getCurrentUser: async () => session.user,
    signOut: async () => {},
  }),
  isLocalLoginAllowed: () => true,
  signInLocal: async () => {
    throw new Error("not used in tests");
  },
}));

import { loadBookForReader, loadServerProgress, recommendBooks } from "./access";

const owner: User = { id: "u_owner", name: "אמא", role: "parent" };
const stranger: User = { id: "u_other", name: "אורח", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

let data: TempData;

beforeEach(async () => {
  session.user = null;
  data = await createTempData({ setEnv: true });
});

afterEach(async () => {
  await data.cleanup();
});

describe("loadBookForReader", () => {
  it("opens a published book for anyone", async () => {
    const book = await data.repo.createBook({ title: "Public", slug: "public", ownerId: owner.id, status: "published" });
    const result = await loadBookForReader(book.slug);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viaToken).toBe(false);
      expect(result.isOwnerOrStaff).toBe(false);
    }
  });

  it.each(["draft", "private", "pending"] as const)("hides a %s book from visitors and other users", async (status) => {
    await data.repo.createBook({ title: "Mine", slug: "mine", ownerId: owner.id, status, shareToken: "tok_secret_123" });
    expect((await loadBookForReader("mine")).ok).toBe(false);
    session.user = stranger;
    expect((await loadBookForReader("mine")).ok).toBe(false);
  });

  it("opens a private book for its owner and for editors", async () => {
    await data.repo.createBook({ title: "Mine", slug: "mine", ownerId: owner.id, status: "private" });
    session.user = owner;
    const asOwner = await loadBookForReader("mine");
    expect(asOwner.ok && asOwner.isOwnerOrStaff && !asOwner.viaToken).toBe(true);
    session.user = editor;
    expect((await loadBookForReader("mine")).ok).toBe(true);
  });

  it("opens a private book only with the right share token", async () => {
    await data.repo.createBook({ title: "Mine", slug: "mine", ownerId: owner.id, status: "private", shareToken: "tok_secret_123" });
    const good = await loadBookForReader("mine", "tok_secret_123");
    expect(good.ok && good.viaToken).toBe(true);
    expect((await loadBookForReader("mine", "tok_wrong")).ok).toBe(false);
    expect((await loadBookForReader("mine", "")).ok).toBe(false);
  });

  it("never accepts a token for a private book that has none", async () => {
    await data.repo.createBook({ title: "Mine", slug: "mine", ownerId: owner.id, status: "private" });
    expect((await loadBookForReader("mine", "undefined")).ok).toBe(false);
  });

  it("treats missing and malformed slugs as not found", async () => {
    expect((await loadBookForReader("no-such-book")).ok).toBe(false);
    expect((await loadBookForReader("../etc/passwd")).ok).toBe(false);
  });
});

describe("reader data helpers", () => {
  it("returns the saved position only for a signed-in reader", async () => {
    const book = await data.repo.createBook({
      title: "Public",
      ownerId: owner.id,
      status: "published",
      pages: [
        { index: 0, text: "א" },
        { index: 1, text: "ב" },
        { index: 2, text: "ג" },
      ],
    });
    expect(await loadServerProgress(null, book.id)).toBeNull();
    expect(await loadServerProgress(stranger, book.id)).toBeNull();
    await data.repo.setProgress(stranger.id, book.id, 2, false);
    expect(await loadServerProgress(stranger, book.id)).toMatchObject({ pageIndex: 2, completed: false });
  });

  it("recommends published books, the closest match first, and never the book itself", async () => {
    const make = (title: string, extra: Record<string, unknown> = {}) =>
      data.repo.createBook({ title, ownerId: owner.id, status: "published", ageGroup: "3-5", ...extra });
    const book = await make("Current", { categories: ["animals"], themes: ["courage"] });
    const similar = await make("Similar", { categories: ["animals"] });
    const sameAge = await make("Same age", { categories: ["humor"], viewCount: 50 });
    const otherAge = await make("Other age", { ageGroup: "6-8" });
    await make("Hidden", { status: "private", categories: ["animals"] });

    const ids = (await recommendBooks(book, 4)).map((entry) => entry.id);
    expect(ids).toEqual([similar.id, sameAge.id, otherAge.id]);
  });
});
