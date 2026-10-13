/**
 * Route handlers called directly (no HTTP server). Only requireUser is
 * replaced; the repository, media store and mock AI providers are real and
 * run against a temp data directory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/types";
import type { NarrationEvent } from "@/lib/narration/types";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

let currentUser: User | null = null;

vi.mock("@/lib/auth", async () => {
  const types = await vi.importActual<typeof import("@/lib/auth/types")>("@/lib/auth/types");
  const rank = { parent: 0, editor: 1, admin: 2 } as const;
  return {
    AuthError: types.AuthError,
    requireUser: async () => {
      if (!currentUser) throw new types.AuthError(401);
      return currentUser;
    },
    canEditBook: (book: { ownerId: string }, user: User | null) =>
      !!user && (user.id === book.ownerId || rank[user.role] >= rank.editor),
    hasRole: (user: Pick<User, "role"> | null | undefined, role: User["role"]) => !!user && rank[user.role] >= rank[role],
  };
});

import { GET, POST } from "./[bookId]/route";
import { POST as nikudPost } from "./nikud/route";

const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
const stranger: User = { id: "u_other", name: "אחר", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

function context(bookId: string) {
  return { params: Promise.resolve({ bookId }) };
}

function post(body?: unknown): Request {
  return new Request("http://localhost/api/narration/x", {
    method: "POST",
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

async function readEvents(response: Response): Promise<NarrationEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as NarrationEvent);
}

describe("narration routes", () => {
  let temp: TempData;
  let bookId: string;

  beforeEach(async () => {
    for (const name of ["NIKUD_PROVIDER", "TTS_PROVIDER", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
      vi.stubEnv(name, "");
    }
    temp = await createTempData({ setEnv: true });
    const book = await temp.repo.createBook({
      title: "ספר בדיקה",
      ownerId: owner.id,
      pages: [
        { index: 0, text: "אחת שתיים שלוש" },
        { index: 1, text: "ארבע חמש" },
      ],
    });
    bookId = book.id;
    currentUser = owner;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await temp.cleanup();
  });

  it("rejects anonymous users, other parents, bad ids and bad bodies", async () => {
    currentUser = null;
    expect((await POST(post(), context(bookId))).status).toBe(401);
    expect((await GET(post(), context(bookId))).status).toBe(401);

    // Someone else's book looks exactly like a missing one (as in the studio), so ids cannot be probed.
    currentUser = stranger;
    expect((await POST(post(), context(bookId))).status).toBe(404);
    expect((await GET(post(), context(bookId))).status).toBe(404);
    expect((await temp.repo.getBookById(bookId))!.pages[0].audio).toBeUndefined();

    currentUser = owner;
    expect((await POST(post(), context("missing"))).status).toBe(404);
    expect((await POST(post(), context("../etc"))).status).toBe(404);
    expect((await POST(post("{not json"), context(bookId))).status).toBe(400);
    expect((await POST(post({ force: "yes" }), context(bookId))).status).toBe(400);
    expect((await POST(post({ unknown: 1 }), context(bookId))).status).toBe(400);
  });

  it("streams progress and stores mock narration for the owner", async () => {
    const response = await POST(post(), context(bookId));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");

    const events = await readEvents(response);
    expect(events.map((event) => event.type)).toEqual(["start", "page", "page", "done"]);
    expect(events[0]).toMatchObject({ type: "start", total: 2, ttsMock: true, nikudMock: true, ttsProvider: "mock" });
    expect(events[1]).toMatchObject({ type: "page", done: 1, total: 2, result: { status: "narrated", audioSource: "mock" } });
    const done = events[3];
    expect(done.type === "done" && done.summary).toMatchObject({ narrated: 2, failed: 0, ttsMock: true });

    const book = await temp.repo.getBookById(bookId);
    expect(book!.pages.every((page) => page.audioSource === "mock" && !!page.audio)).toBe(true);

    const state = await (await GET(post(), context(bookId))).json();
    expect(state).toMatchObject({ bookId, ttsMock: true });
    expect(state.pages).toEqual([
      { pageIndex: 0, hasText: true, hasAudio: true, audioSource: "mock", upToDate: true, hasNikud: false },
      { pageIndex: 1, hasText: true, hasAudio: true, audioSource: "mock", upToDate: true, hasNikud: false },
    ]);
  });

  it("lets an editor narrate selected pages of someone else's book", async () => {
    currentUser = editor;
    const events = await readEvents(await POST(post({ pages: [1] }), context(bookId)));
    expect(events.map((event) => event.type)).toEqual(["start", "page", "done"]);
    const book = await temp.repo.getBookById(bookId);
    expect(book!.pages[0].audio).toBeUndefined();
    expect(book!.pages[1].audio).toBeDefined();
  });

  it("answers 503 when the configured TTS provider is unusable", async () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    vi.stubEnv("TTS_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(post(), context(bookId));
    expect(response.status).toBe(503);
    expect((await temp.repo.getBookById(bookId))!.pages[0].audio).toBeUndefined();
  });

  it("vocalizes text for signed-in users and says when it is a mock", async () => {
    const request = (body: unknown) =>
      new Request("http://localhost/api/narration/nikud", { method: "POST", body: JSON.stringify(body) });

    currentUser = null;
    expect((await nikudPost(request({ text: "שלום" }))).status).toBe(401);

    currentUser = owner;
    const ok = await nikudPost(request({ text: "שלום עולם" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ text: "שלום עולם", isMock: true, provider: "mock" });

    expect((await nikudPost(request({ text: 5 }))).status).toBe(400);
    expect((await nikudPost(request({ text: "א".repeat(8001) }))).status).toBe(400);
    expect((await nikudPost(new Request("http://localhost/x", { method: "POST", body: "nope" }))).status).toBe(400);
  });

  it("answers 502 when the nikud service fails", async () => {
    vi.stubEnv("NIKUD_PROVIDER", "dicta");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await nikudPost(
      new Request("http://localhost/api/narration/nikud", { method: "POST", body: JSON.stringify({ text: "שלום" }) }),
    );
    expect(response.status).toBe(502);
    vi.unstubAllGlobals();
  });

  it("keeps AuthError usable as a value", () => {
    expect(new AuthError(403).status).toBe(403);
  });
});
