import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import * as ratingRoute from "./[bookId]/route";

const alice: User = { id: "u_alice", name: "א", role: "parent" };
const bob: User = { id: "u_bob", name: "ב", role: "parent" };

function req(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/ratings/x", {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (bookId: string) => ({ params: Promise.resolve({ bookId }) });

let data: TempData;
let bookId: string;
let privateId: string;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  currentUser = null;
  const pages = [{ index: 0, text: "עמוד" }];
  bookId = (await data.repo.createBook({ title: "Public", ownerId: "system", status: "published", pages })).id;
  privateId = (await data.repo.createBook({ title: "Private", ownerId: alice.id, status: "private", pages })).id;
});

afterEach(async () => {
  await data.cleanup();
});

describe("ratings API", () => {
  it("averages ratings of different users and shows each their own", async () => {
    currentUser = alice;
    expect((await ratingRoute.PUT(req("PUT", { stars: 5 }), ctx(bookId))).status).toBe(200);
    currentUser = bob;
    const res = await ratingRoute.PUT(req("PUT", { stars: 2 }), ctx(bookId));
    expect(await res.json()).toMatchObject({ average: 3.5, count: 2, mine: 2 });

    currentUser = null;
    expect(await (await ratingRoute.GET(req("GET"), ctx(bookId))).json()).toMatchObject({ average: 3.5, count: 2, mine: null });
  });

  it("replaces a user's rating instead of adding a second one, and DELETE removes it", async () => {
    currentUser = alice;
    await ratingRoute.PUT(req("PUT", { stars: 1 }), ctx(bookId));
    const again = await ratingRoute.PUT(req("PUT", { stars: 4 }), ctx(bookId));
    expect(await again.json()).toMatchObject({ average: 4, count: 1, mine: 4 });
    const gone = await ratingRoute.DELETE(req("DELETE"), ctx(bookId));
    expect(await gone.json()).toMatchObject({ average: 0, count: 0, mine: null });
  });

  it("rejects anonymous writes, out-of-range stars and books the user cannot see", async () => {
    expect((await ratingRoute.PUT(req("PUT", { stars: 3 }), ctx(bookId))).status).toBe(401);
    currentUser = alice;
    expect((await ratingRoute.PUT(req("PUT", { stars: 6 }), ctx(bookId))).status).toBe(400);
    expect((await ratingRoute.PUT(req("PUT", { stars: 0 }), ctx(bookId))).status).toBe(400);
    expect((await ratingRoute.PUT(req("PUT", { stars: 2.5 }), ctx(bookId))).status).toBe(400);
    currentUser = bob;
    expect((await ratingRoute.PUT(req("PUT", { stars: 3 }), ctx(privateId))).status).toBe(404);
  });
});
