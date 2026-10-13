/** Authorisation and validation of the admin route handlers, against a temp data dir. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/types";
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
    requireRole: async (role: keyof typeof rank) => {
      if (!session.user) throw new AuthError(401);
      if (!hasRole(session.user, role)) throw new AuthError(403);
      return session.user;
    },
    requireRolePage: async () => {
      throw new Error("not used by route handlers");
    },
  };
});

import { DELETE as deleteBook, PATCH as patchBook } from "./books/[id]/route";
import { POST as reviewBook } from "./books/[id]/review/route";
import { POST as createCollection } from "./collections/route";
import { DELETE as deleteCollection, PATCH as patchCollection } from "./collections/[id]/route";
import { PUT as putSettings } from "./settings/route";
import { PATCH as patchUser } from "./users/[id]/route";

const PARENT: User = { id: "u_parent", name: "הורה", role: "parent" };
const EDITOR: User = { id: "u_editor", name: "עורכת", role: "editor" };
const ADMIN: User = { id: "u_admin", name: "מנהל", role: "admin" };

let data: TempData;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  session.user = null;
});
afterEach(async () => {
  await data.cleanup();
});

function request(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/admin/x", {
    method,
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function pendingBook() {
  return data.repo.createBook({
    title: "ספר ממתין",
    ownerId: PARENT.id,
    status: "pending",
    license: "CC BY 4.0",
    source: "נכתב לאתר",
    pages: [{ index: 0, text: "טקסט" }],
  });
}

describe("admin API authorisation", () => {
  it("rejects anonymous visitors (401) and parents (403) on every mutating route", async () => {
    const book = await pendingBook();
    const calls = [
      () => reviewBook(request("POST", { action: "approve" }), ctx(book.id)),
      () => patchBook(request("PATCH", { status: "published" }), ctx(book.id)),
      () => deleteBook(request("DELETE"), ctx(book.id)),
      () => createCollection(request("POST", { title: "אוסף" })),
      () => patchCollection(request("PATCH", { title: "אוסף" }), ctx("col_1")),
      () => deleteCollection(request("DELETE"), ctx("col_1")),
      () => putSettings(request("PUT", { bookOfTheWeekId: null })),
      () => patchUser(request("PATCH", { role: "admin" }), ctx(PARENT.id)),
    ];
    for (const call of calls) expect((await call()).status).toBe(401);
    session.user = PARENT;
    for (const call of calls) expect((await call()).status).toBe(403);

    expect((await data.repo.getBookById(book.id))?.status).toBe("pending");
    expect(await data.repo.listCollections()).toEqual([]);
  });

  it("role changes are admin only", async () => {
    const target = await data.repo.upsertUser({ name: "הורה", email: "p@example.com" });
    session.user = EDITOR;
    expect((await patchUser(request("PATCH", { role: "editor" }), ctx(target.id))).status).toBe(403);
    expect((await data.repo.getUser(target.id))?.role).toBe("parent");

    session.user = ADMIN;
    const response = await patchUser(request("PATCH", { role: "editor" }), ctx(target.id));
    expect(response.status).toBe(200);
    expect((await data.repo.getUser(target.id))?.role).toBe("editor");
  });

  it("rejects cross-origin requests even for an editor", async () => {
    const book = await pendingBook();
    session.user = EDITOR;
    const response = await reviewBook(
      request("POST", { action: "approve" }, { origin: "https://evil.example" }),
      ctx(book.id),
    );
    expect(response.status).toBe(403);
    expect((await data.repo.getBookById(book.id))?.status).toBe("pending");
  });
});

describe("admin API behaviour", () => {
  beforeEach(() => {
    session.user = EDITOR;
  });

  it("approves a pending book", async () => {
    const book = await pendingBook();
    const response = await reviewBook(
      request("POST", { action: "approve" }, { origin: "http://localhost:3000" }),
      ctx(book.id),
    );
    expect(response.status).toBe(200);
    const stored = await data.repo.getBookById(book.id);
    expect(stored?.status).toBe("published");
    expect(stored?.publishedAt).toBeTruthy();
  });

  it("rejects with a note, and requires the note", async () => {
    const book = await pendingBook();
    expect((await reviewBook(request("POST", { action: "reject" }), ctx(book.id))).status).toBe(400);
    const response = await reviewBook(request("POST", { action: "reject", note: "נא לתקן" }), ctx(book.id));
    expect(response.status).toBe(200);
    const stored = await data.repo.getBookById(book.id);
    expect(stored?.status).toBe("private");
    expect(stored?.reviewNote).toBe("נא לתקן");
    // A second decision on the same book is a conflict.
    expect((await reviewBook(request("POST", { action: "approve" }), ctx(book.id))).status).toBe(409);
  });

  it("validates input: bad status, bad id, missing body, unknown book", async () => {
    const book = await pendingBook();
    expect((await patchBook(request("PATCH", { status: "deleted" }), ctx(book.id))).status).toBe(400);
    expect((await patchBook(request("PATCH", { status: "draft" }), ctx("../etc"))).status).toBe(400);
    expect((await patchBook(request("PATCH"), ctx(book.id))).status).toBe(400);
    expect((await patchBook(request("PATCH", { status: "draft" }), ctx("missing"))).status).toBe(404);
    expect((await deleteBook(request("DELETE"), ctx("missing"))).status).toBe(404);
  });

  it("deletes a book", async () => {
    const book = await pendingBook();
    const response = await deleteBook(request("DELETE"), ctx(book.id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaDeleted: true });
    expect(await data.repo.getBookById(book.id)).toBeNull();
  });

  it("manages collections and the book of the week", async () => {
    const book = await pendingBook();
    expect((await putSettings(request("PUT", { bookOfTheWeekId: book.id }))).status).toBe(409);
    await patchBook(request("PATCH", { status: "published" }), ctx(book.id));
    expect((await putSettings(request("PUT", { bookOfTheWeekId: book.id }))).status).toBe(200);
    expect((await data.repo.getSettings()).bookOfTheWeekId).toBe(book.id);

    const created = await createCollection(request("POST", { title: "חורף", season: "winter", bookIds: [book.id] }));
    expect(created.status).toBe(201);
    const collection = (await created.json()) as { id: string };
    expect((await createCollection(request("POST", { title: "" }))).status).toBe(400);

    const patched = await patchCollection(request("PATCH", { season: null, bookIds: [] }), ctx(collection.id));
    expect(patched.status).toBe(200);
    expect(await data.repo.getCollectionById(collection.id)).toMatchObject({ bookIds: [] });
    expect((await patchCollection(request("PATCH", { title: "x" }), ctx("col_missing"))).status).toBe(404);

    expect((await deleteCollection(request("DELETE"), ctx(collection.id))).status).toBe(200);
    expect(await data.repo.listCollections()).toEqual([]);
  });
});
