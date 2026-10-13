/**
 * The admin Book Dash routes, called directly. GitHub is replaced by a stub
 * fetch that serves the real fixtures; nothing touches the network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKDASH, BookDashClient, type FetchLike } from "@/lib/importers/bookdash";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

const session = vi.hoisted(() => ({ user: null as User | null }));
const github = vi.hoisted(() => ({ fetch: null as unknown, requests: [] as string[] }));

vi.mock("@/lib/auth", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const rank = { parent: 1, editor: 2, admin: 3 } as const;
  const hasRole = (user: Pick<User, "role"> | null, role: keyof typeof rank) => !!user && rank[user.role] >= rank[role];
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

vi.mock("@/lib/importers/bookdash-catalogue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/importers/bookdash-catalogue")>();
  const client = () => new BookDashClient({ fetch: github.fetch as FetchLike });
  return {
    ...actual,
    bookDashClient: client,
    // No cache in tests: every request sees the current stub.
    cachedBookDashCatalogue: async () => ({ ...(await client().catalogue()), fetchedAt: "2026-10-13T00:00:00.000Z" }),
  };
});

import { GET, POST } from "./route";

const FIXTURES = path.resolve(process.cwd(), "src/lib/importers/__fixtures__");
const SLOTH_MD = readFileSync(path.join(FIXTURES, "bookdash-sleepy-mr-sloth.md"), "utf8");
const META_YML = readFileSync(path.join(FIXTURES, "bookdash-meta.yml"), "utf8");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

const PARENT: User = { id: "u_parent", name: "הורה", role: "parent" };
const EDITOR: User = { id: "u_editor", name: "עורכת", role: "editor" };

function installGithub(): void {
  const base = `${BOOKDASH.rawBase}/sleepy-mr-sloth/en`;
  const routes = new Map<string, string | Uint8Array>([
    [`${BOOKDASH.apiBase}/?ref=gh-pages`, JSON.stringify([{ name: "a-fish-and-a-gift", type: "dir" }, { name: "sleepy-mr-sloth", type: "dir" }, { name: "css", type: "dir" }])],
    [`${BOOKDASH.rawBase}/_data/meta.yml`, META_YML],
    [`${base}/index.md`, SLOTH_MD],
    [`${base}/images/cover.jpg`, JPEG],
    [`${base}/images/book-dash-logo.png`, PNG],
  ]);
  for (let i = 1; i <= 12; i++) routes.set(`${base}/images/${String(i).padStart(2, "0")}.jpg`, JPEG);
  github.requests = [];
  const fetch: FetchLike = async (url) => {
    github.requests.push(url);
    const body = routes.get(url);
    const bytes = body === undefined ? new Uint8Array() : typeof body === "string" ? new TextEncoder().encode(body) : body;
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      headers: { get: () => null },
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };
  };
  github.fetch = fetch;
}

function request(method: "GET" | "POST", body?: unknown, origin?: string): Request {
  return new Request("http://localhost:3000/api/admin/import/bookdash", {
    method,
    headers: { "content-type": "application/json", host: "localhost:3000", ...(origin ? { origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("admin Book Dash import routes", () => {
  let data: TempData;
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    data = await createTempData({ setEnv: true });
    session.user = null;
    installGithub();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await data.cleanup();
  });

  it("is for editors and admins only, and refuses other sites", async () => {
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await POST(request("POST", { slug: "sleepy-mr-sloth" }))).status).toBe(401);
    session.user = PARENT;
    expect((await GET(request("GET"))).status).toBe(403);
    expect((await POST(request("POST", { slug: "sleepy-mr-sloth" }))).status).toBe(403);
    session.user = EDITOR;
    expect((await POST(request("POST", { slug: "sleepy-mr-sloth" }, "http://evil.example"))).status).toBe(403);
    expect(github.requests).toEqual([]);
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);
  });

  it("lists the catalogue, imports one book for the acting editor, and shows its state afterwards", async () => {
    session.user = EDITOR;
    const before = (await (await GET(request("GET"))).json()) as { rows: { slug: string; title: string; local?: unknown }[]; complete: boolean };
    expect(before.complete).toBe(true);
    expect(before.rows.map((row) => [row.slug, row.title, row.local])).toEqual([
      ["a-fish-and-a-gift", "A Fish and a Gift", undefined],
      ["sleepy-mr-sloth", "Sleepy Mr Sloth", undefined],
    ]);

    const created = await POST(request("POST", { slug: "sleepy-mr-sloth" }, "http://localhost:3000"));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      status: "created",
      warnings: [],
      book: {
        id: "bookdash-sleepy-mr-sloth",
        status: "draft",
        pages: 12,
        translated: false,
        missingCredits: ["author", "illustrator", "designer", "editor"],
      },
    });
    const stored = await data.repo.getBookById("bookdash-sleepy-mr-sloth");
    expect(stored).toMatchObject({ ownerId: EDITOR.id, language: "en", status: "draft" });

    const again = await POST(request("POST", { slug: "sleepy-mr-sloth" }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "skipped" });

    await data.repo.updateBook("bookdash-sleepy-mr-sloth", { language: "he", author: "A", illustrator: "B" });
    const after = (await (await GET(request("GET"))).json()) as { rows: { slug: string; local?: Record<string, unknown> }[] };
    expect(after.rows.find((row) => row.slug === "sleepy-mr-sloth")?.local).toEqual({
      id: "bookdash-sleepy-mr-sloth",
      slug: "sleepy-mr-sloth",
      title: "Sleepy Mr Sloth",
      status: "draft",
      translated: true,
      missingCredits: ["designer", "editor"],
    });
  });

  it("answers with a Hebrew message for an unknown book and rejects a bad slug", async () => {
    session.user = EDITOR;
    const missing = await POST(request("POST", { slug: "no-such-book" }));
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toMatch(/Book Dash/);
    expect((await POST(request("POST", { slug: "../etc/passwd" }))).status).toBe(400);
    expect((await POST(request("POST", { slug: "sleepy-mr-sloth", force: true }))).status).toBe(400);
  });
});
