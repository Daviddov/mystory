import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { createTempData, type TempData } from "@/test/temp-data";
import type { User } from "@/lib/types";

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

import * as listRoute from "./[bookId]/route";
import * as itemRoute from "./[bookId]/[commentId]/route";

const alice: User = { id: "u_alice", name: "אליס", email: "alice@example.com", role: "parent" };
const bob: User = { id: "u_bob", name: "bob@example.com", email: "bob@example.com", role: "parent" };
const admin: User = { id: "u_admin", name: "מנהלת", role: "admin" };

const SHARE_TOKEN = "abcdefghijklmnopqrstuvwx";

function req(method: string, body?: unknown, query = ""): Request {
  return new Request(`http://localhost:3000/api/comments/x${query}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (bookId: string) => ({ params: Promise.resolve({ bookId }) });
const itemCtx = (bookId: string, commentId: string) => ({ params: Promise.resolve({ bookId, commentId }) });

interface View {
  id: string;
  authorName: string;
  body: string;
  canDelete: boolean;
}

async function post(bookId: string, body: unknown): Promise<Response> {
  return listRoute.POST(req("POST", body), ctx(bookId));
}
async function list(bookId: string, query = ""): Promise<{ status: number; comments: View[] }> {
  const res = await listRoute.GET(req("GET", undefined, query), ctx(bookId));
  const json = (await res.json()) as { comments?: View[] };
  return { status: res.status, comments: json.comments ?? [] };
}

let data: TempData;
let bookId: string;
let privateId: string;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  resetRateLimits();
  currentUser = null;
  const pages = [{ index: 0, text: "עמוד" }];
  bookId = (await data.repo.createBook({ title: "Public", ownerId: "system", status: "published", pages })).id;
  privateId = (await data.repo.createBook({ title: "Private", ownerId: alice.id, status: "private", pages })).id;
  await data.repo.updateBook(privateId, { shareToken: SHARE_TOKEN });
});

afterEach(async () => {
  await data.cleanup();
});

describe("comments API", () => {
  it("lists everyone's comments newest first, with display names and no e-mail or user id", async () => {
    currentUser = alice;
    expect((await post(bookId, { body: "  ספר נהדר  " })).status).toBe(201);
    currentUser = bob;
    expect((await post(bookId, { body: "אהבנו מאוד" })).status).toBe(201);

    currentUser = null;
    const { status, comments } = await list(bookId);
    expect(status).toBe(200);
    expect(comments.map((c) => c.body)).toEqual(["אהבנו מאוד", "ספר נהדר"]);
    expect(comments.map((c) => c.authorName)).toEqual(["bob", "אליס"]);
    expect(comments.every((c) => !c.canDelete)).toBe(true);
    const raw = JSON.stringify(comments);
    expect(raw).not.toContain("@");
    expect(raw).not.toContain("u_alice");
  });

  it("rejects anonymous writes and empty, blank or too long comments", async () => {
    expect((await post(bookId, { body: "שלום" })).status).toBe(401);
    currentUser = alice;
    expect((await post(bookId, {})).status).toBe(400);
    expect((await post(bookId, { body: "" })).status).toBe(400);
    expect((await post(bookId, { body: "   \n " })).status).toBe(400);
    expect((await post(bookId, { body: "א".repeat(1001) })).status).toBe(400);
    expect((await post(bookId, { body: 42 })).status).toBe(400);
    expect((await post(bookId, { body: "א".repeat(1000) })).status).toBe(201);
  });

  it("keeps markup as plain text", async () => {
    currentUser = alice;
    const res = await post(bookId, { body: "<b>שלום</b>" });
    expect(((await res.json()) as { comment: View }).comment.body).toBe("<b>שלום</b>");
  });

  it("lets authors delete their own comments, forbids other parents and allows admins", async () => {
    currentUser = alice;
    const first = ((await (await post(bookId, { body: "ראשונה" })).json()) as { comment: View }).comment;
    const second = ((await (await post(bookId, { body: "שנייה" })).json()) as { comment: View }).comment;
    expect(first.canDelete).toBe(true);

    currentUser = null;
    expect((await itemRoute.DELETE(req("DELETE"), itemCtx(bookId, first.id))).status).toBe(401);

    currentUser = bob;
    expect((await list(bookId)).comments.every((c) => !c.canDelete)).toBe(true);
    expect((await itemRoute.DELETE(req("DELETE"), itemCtx(bookId, first.id))).status).toBe(403);

    currentUser = admin;
    expect((await list(bookId)).comments.every((c) => c.canDelete)).toBe(true);
    expect((await itemRoute.DELETE(req("DELETE"), itemCtx(bookId, first.id))).status).toBe(200);

    currentUser = alice;
    // A comment id under another book is not found.
    expect((await itemRoute.DELETE(req("DELETE"), itemCtx(privateId, second.id))).status).toBe(404);
    expect((await itemRoute.DELETE(req("DELETE"), itemCtx(bookId, second.id))).status).toBe(200);
    expect((await list(bookId)).comments).toEqual([]);
  });

  it("hides comments on private books except from those who may view them, including by share token", async () => {
    currentUser = alice;
    expect((await post(privateId, { body: "רק שלי" })).status).toBe(201);

    currentUser = bob;
    expect((await list(privateId)).status).toBe(404);
    expect((await post(privateId, { body: "שלום" })).status).toBe(404);
    expect((await list(privateId, `?token=${SHARE_TOKEN}`)).comments).toHaveLength(1);
    expect((await post(privateId, { body: "דרך קישור", token: SHARE_TOKEN })).status).toBe(201);

    currentUser = null;
    expect((await list(privateId)).status).toBe(404);
    expect((await list(privateId, `?token=${SHARE_TOKEN}`)).comments).toHaveLength(2);
  });

  it("removes a book's comments when the book is deleted", async () => {
    currentUser = alice;
    await post(bookId, { body: "שלום" });
    await data.repo.deleteBook(bookId);
    expect(await data.repo.listComments(bookId)).toEqual([]);
  });
});
