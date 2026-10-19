/**
 * POST /api/studio/books/<id>/details called directly, over a temp data
 * directory. The mock text provider is real; a fake non-mock provider is
 * injected for the suggestion path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookWithPages, User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

let currentUser: User | null = null;
let fakeText: { isMock: boolean; data: unknown } | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!currentUser) throw new actual.AuthError(401);
      return currentUser;
    },
  };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    getTextProvider: async () =>
      fakeText
        ? { name: "fake", isMock: fakeText.isMock, generate: async () => ({ data: fakeText!.data, isMock: fakeText!.isMock }) }
        : actual.getTextProvider(),
  };
});

import { POST as details } from "./books/[id]/details/route";

const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
const stranger: User = { id: "u_other", name: "אחר", role: "parent" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown = {}) =>
  new Request("http://localhost/api/studio/books/x/details", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  });

describe("studio details route", () => {
  let temp: TempData;
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("TEXT_PROVIDER", "");
    temp = await createTempData({ setEnv: true });
    currentUser = owner;
    fakeText = null;
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await temp.cleanup();
  });

  async function makeBook(options: { status?: "draft" | "published"; text?: string } = {}): Promise<BookWithPages> {
    const book = await temp.repo.createBook({
      title: "ספר בדיקה",
      ownerId: owner.id,
      license: "CC BY 4.0",
      origin: "manual",
      pages: [{ index: 0, text: options.text ?? "דנה בגן" }],
    });
    if (options.status && options.status !== "draft") await temp.repo.updateBook(book.id, { status: options.status });
    return (await temp.repo.getBookById(book.id))!;
  }

  it("with the mock provider says isMock and suggests nothing", async () => {
    const book = await makeBook();
    const res = await details(post(), ctx(book.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: {}, isMock: true });
    expect((await temp.repo.getBookById(book.id))?.summary).toBe("");
  });

  it("returns cleaned suggestions from a real provider and does not change the book", async () => {
    fakeText = {
      isMock: false,
      data: {
        title: "הירח של דנה",
        summary: "תקציר.",
        tags: ["ירח", "ירח", "גן"],
        themes: ["curiosity", "nonsense"],
        categories: ["adventures", "nope"],
        discussionQuestions: ["מה הרגשת?"],
      },
    };
    const book = await makeBook();
    const body = (await (await details(post(), ctx(book.id))).json()) as { suggestions: Record<string, unknown>; isMock: boolean };
    expect(body.isMock).toBe(false);
    expect(body.suggestions).toEqual({
      title: "הירח של דנה",
      summary: "תקציר.",
      tags: ["ירח", "גן"],
      themes: ["curiosity"],
      categories: ["adventures"],
      discussionQuestions: ["מה הרגשת?"],
    });
    expect((await temp.repo.getBookById(book.id))?.title).toBe("ספר בדיקה");
  });

  it("honours the fields filter and rejects unknown fields", async () => {
    fakeText = { isMock: false, data: { title: "כותרת", summary: "תקציר", tags: ["א"], themes: [], categories: [], discussionQuestions: [] } };
    const book = await makeBook();
    const body = (await (await details(post({ fields: ["summary"] }), ctx(book.id))).json()) as { suggestions: Record<string, unknown> };
    expect(body.suggestions).toEqual({ summary: "תקציר" });
    expect((await details(post({ fields: ["license"] }), ctx(book.id))).status).toBe(400);
  });

  it("answers 422 for a book without text", async () => {
    const book = await makeBook({ text: "  " });
    expect((await details(post(), ctx(book.id))).status).toBe(422);
  });

  it("401 anonymous, 404 another user's book, 409 locked book", async () => {
    const book = await makeBook();
    currentUser = stranger;
    expect((await details(post(), ctx(book.id))).status).toBe(404);
    currentUser = null;
    expect((await details(post(), ctx(book.id))).status).toBe(401);
    currentUser = owner;
    const published = await makeBook({ status: "published" });
    expect((await details(post(), ctx(published.id))).status).toBe(409);
  });
});
