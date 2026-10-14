/** Bulk actions of the publishing pipeline, against a temp data dir. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookReadiness, inPipelineView, isNarrated, pipelineRow } from "@/app/admin/_lib/readiness";
import type { Page, User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

const session = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const rank = { parent: 1, editor: 2, admin: 3 } as const;
  const hasRole = (user: Pick<User, "role"> | null, role: keyof typeof rank) =>
    !!user && rank[user.role] >= rank[role];
  return {
    AuthError,
    hasRole,
    canEditBook: (book: { ownerId: string }, user: User) => book.ownerId === user.id || hasRole(user, "editor"),
    requireRole: async (role: keyof typeof rank) => {
      if (!session.user) throw new AuthError(401);
      if (!hasRole(session.user, role)) throw new AuthError(403);
      return session.user;
    },
  };
});

import { POST } from "./route";

const PARENT: User = { id: "u_parent", name: "הורה", role: "parent" };
const EDITOR: User = { id: "u_editor", name: "עורכת", role: "editor" };

let data: TempData;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  session.user = EDITOR;
});
afterEach(async () => {
  await data.cleanup();
});

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/books/bulk", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000" },
    body: JSON.stringify(body),
  });
}

async function results(response: Response): Promise<{ id: string; ok: boolean; error?: string }[]> {
  return ((await response.json()) as { results: { id: string; ok: boolean; error?: string }[] }).results;
}

function draft(overrides: Record<string, unknown> = {}, pages: Page[] = [{ index: 0, text: "היה היה ארנב" }]) {
  return data.repo.createBook({
    title: "ספר",
    ownerId: PARENT.id,
    status: "draft",
    summary: "תקציר",
    author: "מחברת",
    license: "CC BY 4.0",
    source: "נכתב לאתר",
    categories: ["animals"],
    pages,
    ...overrides,
  });
}

describe("POST /api/admin/books/bulk", () => {
  it("is for editors only", async () => {
    const book = await draft();
    const body = { action: "publish", ids: [book.id] };
    session.user = null;
    expect((await POST(request(body))).status).toBe(401);
    session.user = PARENT;
    expect((await POST(request(body))).status).toBe(403);
    expect((await data.repo.getBookById(book.id))?.status).toBe("draft");
  });

  it("publishes the books that are ready and reports the others", async () => {
    const ready = await draft();
    const noAuthor = await draft({ title: "בלי מחבר", author: "" });
    const noSource = await draft({ title: "בלי מקור", source: "" });
    const response = await POST(request({ action: "publish", ids: [ready.id, noAuthor.id, noSource.id, "missing"] }));
    expect(response.status).toBe(200);
    const [first, second, third, fourth] = await results(response);
    expect(first).toEqual({ id: ready.id, ok: true });
    expect(second.ok).toBe(false);
    expect(second.error).toContain("חסר שם המחבר");
    expect(third.ok).toBe(false);
    expect(third.error).toContain("חסר מקור");
    expect(fourth.ok).toBe(false);

    const published = await data.repo.getBookById(ready.id);
    expect(published?.status).toBe("published");
    expect(published?.publishedAt).toBeTruthy();
    expect((await data.repo.getBookById(noAuthor.id))?.status).toBe("draft");
    expect((await data.repo.getBookById(noSource.id))?.status).toBe("draft");
  });

  it("adds categories to what a book has, or replaces them", async () => {
    const book = await draft({ categories: ["animals"], themes: ["courage"] });
    const empty = await draft({ title: "ריק", categories: [] });
    await POST(
      request({ action: "meta", ids: [book.id, empty.id], categories: ["humor", "animals"], ageGroup: "6-8" }),
    );
    expect((await data.repo.getBookById(book.id))?.categories).toEqual(["animals", "humor"]);
    expect((await data.repo.getBookById(empty.id))?.categories).toEqual(["humor", "animals"]);
    expect((await data.repo.getBookById(book.id))?.ageGroup).toBe("6-8");
    expect((await data.repo.getBookById(book.id))?.themes).toEqual(["courage"]);

    await POST(request({ action: "meta", ids: [book.id], mode: "replace", categories: ["nature"] }));
    expect((await data.repo.getBookById(book.id))?.categories).toEqual(["nature"]);
  });

  it("refuses unknown categories, an empty change and an empty list", async () => {
    const book = await draft();
    expect((await POST(request({ action: "meta", ids: [book.id], categories: ["nope"] }))).status).toBe(400);
    expect((await POST(request({ action: "meta", ids: [book.id] }))).status).toBe(400);
    expect((await POST(request({ action: "publish", ids: [] }))).status).toBe(400);
  });
});

describe("pipeline readiness", () => {
  it("lists what blocks publication and counts real narration only", async () => {
    const book = await draft({ author: "", categories: [], source: "" }, [
      { index: 0, text: "עמוד ראשון", audio: "books/x/a.mp3", audioSource: "tts" },
      { index: 1, text: "עמוד שני", audio: "books/x/b.wav", audioSource: "mock" },
      { index: 2, text: "עמוד שלישי", textNikud: "עַמּוּד שְׁלִישִׁי" },
      { index: 3, text: "", image: "books/x/p.png" },
    ]);
    const readiness = bookReadiness(book);
    expect(readiness.missing).toEqual(expect.arrayContaining(["חסר מחבר", "חסרה קטגוריה", "חסר מקור"]));
    expect(readiness.textPages).toBe(3);
    expect(readiness.narratedPages).toBe(1);
    expect(readiness.nikudPages).toBe(1);
    expect(readiness.charsToNarrate).toBe("עמוד שני".length + "עמוד שלישי".length);

    const row = pipelineRow(book);
    expect(isNarrated(row)).toBe(false);
    expect(inPipelineView(row, "details")).toBe(true);
    expect(inPipelineView(row, "narration")).toBe(true);
    expect(inPipelineView(row, "ready")).toBe(false);
  });

  it("a complete, narrated draft is ready; once published it leaves the pipeline", async () => {
    const book = await draft({}, [{ index: 0, text: "עמוד", audio: "books/x/a.mp3", audioSource: "recorded" }]);
    const row = pipelineRow(book);
    expect(row.missing).toEqual([]);
    expect(inPipelineView(row, "ready")).toBe(true);
    const published = { ...row, status: "published" as const };
    expect(["details", "narration", "ready", "unpublished"].some((view) => inPipelineView(published, view as never))).toBe(
      false,
    );
  });
});
