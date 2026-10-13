/**
 * Regression tests for review findings at the HTTP boundary: the conditional
 * page save (409 with a Hebrew message), the pending lock and probing answers
 * of the narration route, and the limits on the paid narration endpoints.
 * Route handlers are called directly; only the signed-in user is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import type { BookWithPages, User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

let currentUser: User | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...original,
    getCurrentUser: async () => currentUser,
    requireUser: async () => {
      if (!currentUser) throw new original.AuthError(401);
      return currentUser;
    },
  };
});

import { POST as narrate, GET as narrationState } from "./narration/[bookId]/route";
import { POST as nikud } from "./narration/nikud/route";
import { PUT as putPages } from "./studio/books/[id]/pages/route";
import { PATCH as patchBook } from "./studio/books/[id]/route";

const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
const stranger: User = { id: "u_other", name: "אחר", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

const ORIGIN = "http://localhost:3000";

function request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${url}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const id = (value: string) => ({ params: Promise.resolve({ id: value }) });
const bookId = (value: string) => ({ params: Promise.resolve({ bookId: value }) });

let temp: TempData;
let book: BookWithPages;

beforeEach(async () => {
  for (const name of ["NIKUD_PROVIDER", "TTS_PROVIDER", "TTS_VOICE", "TTS_ALLOWED_VOICES", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    vi.stubEnv(name, "");
  }
  resetRateLimits();
  temp = await createTempData({ setEnv: true });
  book = await temp.repo.createBook({
    title: "ספר בדיקה",
    ownerId: owner.id,
    pages: [{ index: 0, text: "אחת שתיים שלוש" }],
  });
  currentUser = owner;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await temp.cleanup();
});

describe("PUT /api/studio/books/<id>/pages with x-book-updated-at", () => {
  it("answers 409 with a clear Hebrew message when the book changed since the tab loaded it", async () => {
    const opened = book.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const first = await putPages(
      request("PUT", "/api/studio/books/x/pages", { pages: [{ text: "לשונית ב" }] }, { "x-book-updated-at": opened }),
      id(book.id),
    );
    expect(first.status).toBe(200);
    const fresh = ((await first.json()) as { book: BookWithPages }).book.updatedAt;

    const stale = await putPages(
      request("PUT", "/api/studio/books/x/pages", { pages: [{ text: "לשונית א" }] }, { "x-book-updated-at": opened }),
      id(book.id),
    );
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: string; details: { code: string; updatedAt: string } };
    expect(body.error).toContain("הספר השתנה במקום אחר");
    expect(body.error).toContain("טענו את העמוד מחדש");
    expect(body.details).toEqual({ code: "stale-version", updatedAt: fresh });
    expect((await temp.repo.getBookById(book.id))!.pages[0].text).toBe("לשונית ב");

    const staleMeta = await patchBook(
      request("PATCH", "/api/studio/books/x", { title: "שם ישן" }, { "x-book-updated-at": opened }),
      id(book.id),
    );
    expect(staleMeta.status).toBe(409);
    expect((await temp.repo.getBookById(book.id))!.title).toBe("ספר בדיקה");
  });
});

describe("POST /api/narration/<bookId>", () => {
  const post = (body?: unknown, headers: Record<string, string> = {}) =>
    request("POST", "/api/narration/x", body ?? {}, headers);

  it("answers 404 (not 403) for someone else's book, like the studio, so ids cannot be probed", async () => {
    currentUser = stranger;
    const forbidden = await narrate(post(), bookId(book.id));
    const missing = await narrate(post(), bookId("bk_does_not_exist"));
    expect(forbidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await forbidden.json()).toEqual(await missing.json());
    expect((await narrationState(post(), bookId(book.id))).status).toBe(404);
  });

  it("is locked for the owner while the book waits for review or is published", async () => {
    for (const status of ["pending", "published"] as const) {
      await temp.repo.updateBook(book.id, { status });
      currentUser = owner;
      const response = await narrate(post(), bookId(book.id));
      expect(response.status).toBe(409);
      currentUser = editor;
      const allowed = await narrate(post(), bookId(book.id));
      expect(allowed.status).toBe(200);
      await allowed.text(); // let the run finish
    }
  });

  it("refuses cross-site posts and voices that are not configured", async () => {
    expect((await narrate(post({}, { origin: "https://evil.example" }), bookId(book.id))).status).toBe(403);

    const unknownVoice = await narrate(post({ voice: "premium-voice-id" }), bookId(book.id));
    expect(unknownVoice.status).toBe(400);
    expect((await temp.repo.getBookById(book.id))!.pages[0].audio).toBeUndefined();

    vi.stubEnv("TTS_ALLOWED_VOICES", "voiceA, premium-voice-id");
    const allowed = await narrate(post({ voice: "premium-voice-id" }), bookId(book.id));
    expect(allowed.status).toBe(200);
    await allowed.text(); // let the run finish
  });

  it("is rate limited per user, with a Retry-After, and not for editors", async () => {
    vi.stubEnv("RATE_LIMIT_NARRATION_PER_HOUR", "2");
    for (let i = 0; i < 2; i += 1) {
      const ok = await narrate(post({ force: true }), bookId(book.id));
      expect(ok.status).toBe(200);
      await ok.text(); // let the run finish before the next one starts
    }
    const limited = await narrate(post({ force: true }), bookId(book.id));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await limited.json()) as { error: string }).error).toContain("יותר מדי בקשות");

    currentUser = editor;
    const staff = await narrate(post({ force: true }), bookId(book.id));
    expect(staff.status).toBe(200);
    await staff.text();
  });
});

describe("POST /api/narration/nikud", () => {
  const post = (headers: Record<string, string> = {}) => request("POST", "/api/narration/nikud", { text: "שלום עולם" }, headers);

  it("is same-origin only and rate limited per user", async () => {
    expect((await nikud(post({ origin: "https://evil.example" }))).status).toBe(403);

    vi.stubEnv("RATE_LIMIT_NIKUD_PER_HOUR", "3");
    for (let i = 0; i < 3; i += 1) expect((await nikud(post())).status).toBe(200);
    expect((await nikud(post())).status).toBe(429);
    currentUser = stranger;
    expect((await nikud(post())).status).toBe(200);
  });
});
