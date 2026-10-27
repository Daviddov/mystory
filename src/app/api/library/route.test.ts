import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingPageResponse } from "@/components/library/infinite";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: async () => state.user,
}));

import { GET } from "./route";

const get = (query: string) => GET(new Request(`http://localhost/api/library?${query}`));

describe("GET /api/library", () => {
  let data: TempData;

  beforeEach(async () => {
    state.user = null;
    data = await createTempData({ setEnv: true });
    // 30 published animal books (two pages of 24) and one private one.
    for (let n = 0; n < 30; n++) {
      const id = `pub-${String(n).padStart(2, "0")}`;
      await data.repo.createBook({
        id,
        slug: id,
        title: `ספר ${n}`,
        ownerId: "system",
        status: "published",
        ageGroup: n % 2 === 0 ? "3-5" : "6-8",
        readingMinutes: 4,
        categories: ["animals"],
        tags: ["גשם"],
        viewCount: n,
        pages: [{ index: 0, text: "טקסט" }],
      });
    }
    await data.repo.createBook({
      id: "priv-1",
      slug: "secret",
      title: "סודי",
      ownerId: "u_owner",
      status: "private",
      ageGroup: "3-5",
      readingMinutes: 4,
      categories: ["animals"],
      tags: ["גשם"],
      viewCount: 999,
      pages: [{ index: 0, text: "סוד" }],
    });
  });

  afterEach(async () => {
    await data.cleanup();
  });

  it("returns the second page of a category, published books and public fields only", async () => {
    const response = await get("scope=category%3Aanimals&sort=popular&page=2");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    const body = (await response.json()) as ListingPageResponse;
    expect(body).toMatchObject({ page: 2, pages: 2, total: 30 });
    expect(body.items.map((item) => item.book.id)).toEqual(["pub-05", "pub-04", "pub-03", "pub-02", "pub-01", "pub-00"]);
    for (const item of body.items) {
      expect(item.book).not.toHaveProperty("ownerId");
      expect(item.book).not.toHaveProperty("shareToken");
      expect(item.book).not.toHaveProperty("pages");
      expect(typeof item.isNew).toBe("boolean");
    }
  });

  it("matches the first page the server renders, so pages join without gaps", async () => {
    const first = (await (await get("scope=tag%3A%D7%92%D7%A9%D7%9D&page=1")).json()) as ListingPageResponse;
    const second = (await (await get("scope=tag%3A%D7%92%D7%A9%D7%9D&page=2")).json()) as ListingPageResponse;
    const ids = [...first.items, ...second.items].map((item) => item.book.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    expect(ids).not.toContain("priv-1");
  });

  it("honours the age filter on browse pages", async () => {
    const body = (await (await get("scope=category%3Aanimals&age=6-8")).json()) as ListingPageResponse;
    expect(body.total).toBe(15);
    expect(body.items.every((item) => item.book.ageGroup === "6-8")).toBe(true);
  });

  it("gives no items past the last page instead of repeating it", async () => {
    const body = (await (await get("scope=category%3Aanimals&page=9")).json()) as ListingPageResponse;
    expect(body.items).toEqual([]);
    expect(body.pages).toBe(2);
  });

  it("searches by text, and needs the text", async () => {
    const found = (await (await get("scope=search&q=%D7%A1%D7%A4%D7%A8")).json()) as ListingPageResponse;
    expect(found.total).toBe(30);
    const none = (await (await get("scope=search")).json()) as ListingPageResponse;
    expect(none).toEqual({ items: [], page: 1, pages: 1, total: 0 });
  });

  it("applies the viewer's read filter on the all-books scope, privately", async () => {
    state.user = { id: "u_reader", role: "parent", name: "קוראת" };
    await data.repo.setProgress("u_reader", "pub-07", 0, true);
    const response = await get("scope=books&read=read");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await response.json()) as ListingPageResponse;
    expect(body.items.map((item) => item.book.id)).toEqual(["pub-07"]);
    expect(body.items[0]?.read).toBe(true);
  });

  it("rejects unknown scopes", async () => {
    expect((await get("scope=nope")).status).toBe(400);
    expect((await get("page=2")).status).toBe(400);
    expect((await get("scope=holiday%3Ano-such-holiday")).status).toBe(404);
  });
});
