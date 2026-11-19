/**
 * Who may download a book as PDF: only its owner, editors and admins. Everyone
 * else, a share-link holder included, gets 404 even for a published book.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/types";

const state: { user: User | null } = { user: null };
const book = {
  id: "bk_1",
  slug: "snail",
  title: "השבלול",
  status: "published",
  ownerId: "u_owner",
  shareToken: "share-token-1234567890",
  pages: [{ text: "x" }],
};

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getCurrentUser: async () => state.user,
}));
vi.mock("@/lib/repo", () => ({
  getRepo: async () => ({ getBookBySlug: async (slug: string) => (slug === book.slug ? book : null) }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimited: async () => null }));
vi.mock("@/lib/pdf", () => ({
  PdfFontsUnavailableError: class extends Error {},
  getBookPdf: async () => ({ bytes: new Uint8Array([37, 80, 68, 70]), sheets: 3, missingImages: [] }),
}));

const { GET } = await import("./route");

const get = (query = "") =>
  GET(new Request(`https://example.test/api/pdf/snail${query}`), { params: Promise.resolve({ slug: "snail" }) });

beforeEach(() => {
  state.user = null;
});

describe("GET /api/pdf/[slug]", () => {
  it("refuses signed-out visitors, other readers and share-link holders", async () => {
    expect((await get()).status).toBe(404);
    expect((await get(`?token=${book.shareToken}`)).status).toBe(404);
    state.user = { id: "u_other", name: "אחר", role: "parent" };
    expect((await get()).status).toBe(404);
  });

  it("serves the owner, editors and admins, never from a shared cache", async () => {
    for (const user of [
      { id: "u_owner", name: "בעלים", role: "parent" },
      { id: "u_ed", name: "עורכת", role: "editor" },
      { id: "u_admin", name: "מנהל", role: "admin" },
    ] as User[]) {
      state.user = user;
      const response = await get();
      expect(response.status, user.role).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
});
