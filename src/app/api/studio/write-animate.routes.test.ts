/**
 * The /api/studio write and animate route handlers called directly. Only
 * requireUser is replaced; the repository, media store and (mock) AI
 * providers are real, over a temp data directory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookWithPages, User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

let currentUser: User | null = null;

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

import { POST as writeStory } from "./books/[id]/write/route";
import { DELETE as removeClip, POST as animatePage } from "./books/[id]/animate/route";

const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
const stranger: User = { id: "u_other", name: "אחר", role: "parent" };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function jsonRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/studio/books/x", {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function mp4(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // "ftyp" at offset 4
  return bytes;
}

function clipRequest(page: number, bytes: Uint8Array | null, name = "clip.mp4"): Request {
  const form = new FormData();
  form.set("page", String(page));
  if (bytes) form.set("file", new Blob([bytes as BlobPart]), name);
  return new Request("http://localhost/api/studio/books/x/animate", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: form,
  });
}

describe("studio write and animate routes", () => {
  let temp: TempData;

  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("TEXT_PROVIDER", "");
    vi.stubEnv("VIDEO_PROVIDER", "");
    temp = await createTempData({ setEnv: true });
    currentUser = owner;
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await temp.cleanup();
  });

  async function makeBook(
    options: { license?: string; origin?: "ai" | "manual" | "import"; status?: "draft" | "published" | "pending" } = {},
  ): Promise<BookWithPages> {
    const dir = "books/bk";
    await temp.media.put(`${dir}/img-1.png`, PNG, "image/png");
    const book = await temp.repo.createBook({
      title: "ספר בדיקה",
      ownerId: owner.id,
      license: options.license ?? "CC BY 4.0",
      origin: options.origin ?? "manual",
      pages: [
        { index: 0, text: "דנה בגן", image: `${dir}/img-1.png`, imageAlt: "A girl in a garden" },
        { index: 1, text: "עמוד בלי איור" },
      ],
    });
    if (options.status && options.status !== "draft") await temp.repo.updateBook(book.id, { status: options.status });
    return (await temp.repo.getBookById(book.id))!;
  }

  describe("write", () => {
    it("writes pages with the mock text provider", async () => {
      const book = await makeBook();
      const res = await writeStory(jsonRequest("POST", { idea: "חתול קטן שמחפש את הירח" }), ctx(book.id));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { pages: { text: string; illustrationPrompt: string }[]; isMock: boolean };
      expect(body.isMock).toBe(true);
      expect(body.pages.length).toBeGreaterThan(0);
      expect(body.pages[0].text.length).toBeGreaterThan(0);
      // The book itself is not changed.
      expect((await temp.repo.getBookById(book.id))?.pages).toHaveLength(2);
    });

    it("rejects a too-short idea, unknown fields and a missing user", async () => {
      const book = await makeBook();
      expect((await writeStory(jsonRequest("POST", { idea: "א" }), ctx(book.id))).status).toBe(400);
      expect((await writeStory(jsonRequest("POST", { idea: "סיפור על חתול", extra: 1 }), ctx(book.id))).status).toBe(400);
      expect((await writeStory(jsonRequest("POST", { idea: "סיפור על חתול", category: "nope" }), ctx(book.id))).status).toBe(400);
      currentUser = null;
      expect((await writeStory(jsonRequest("POST", { idea: "סיפור על חתול" }), ctx(book.id))).status).toBe(401);
    });

    it("answers 404 for another user's book", async () => {
      const book = await makeBook();
      currentUser = stranger;
      expect((await writeStory(jsonRequest("POST", { idea: "סיפור על חתול" }), ctx(book.id))).status).toBe(404);
    });

    it("refuses a published or pending book for its owner", async () => {
      const published = await makeBook({ status: "published" });
      expect((await writeStory(jsonRequest("POST", { idea: "סיפור על חתול" }), ctx(published.id))).status).toBe(409);
      const pending = await makeBook({ status: "pending" });
      expect((await writeStory(jsonRequest("POST", { idea: "סיפור על חתול" }), ctx(pending.id))).status).toBe(409);
    });
  });

  describe("animate: manual clip", () => {
    it("attaches an mp4 to a page with an image, without a videoSource", async () => {
      const book = await makeBook();
      const res = await animatePage(clipRequest(0, mp4()), ctx(book.id));
      expect(res.status).toBe(201);
      const body = (await res.json()) as { status: string; video: string };
      expect(body.status).toBe("attached");
      expect(body.video).toMatch(new RegExp(`^books/${book.id}/animation-01-[0-9a-f]{10}\\.mp4$`));
      expect(await temp.media.get(body.video)).not.toBeNull();

      const page = (await temp.repo.getBookById(book.id))!.pages[0];
      expect(page.video).toBe(body.video);
      expect(page.videoImageHash).toBeTruthy();
      expect(page.videoSource).toBeUndefined();
    });

    it("replaces and cleans up the previous clip", async () => {
      const book = await makeBook();
      const first = (await (await animatePage(clipRequest(0, mp4(40)), ctx(book.id))).json()) as { video: string };
      const second = (await (await animatePage(clipRequest(0, mp4(80)), ctx(book.id))).json()) as { video: string };
      expect(second.video).not.toBe(first.video);
      expect(await temp.media.get(first.video)).toBeNull();
      expect(await temp.media.get(second.video)).not.toBeNull();
    });

    it("accepts webm and sniffs the type from the bytes, not the name", async () => {
      const book = await makeBook();
      const webm = new Uint8Array(32);
      webm.set([0x1a, 0x45, 0xdf, 0xa3]);
      const res = await animatePage(clipRequest(0, webm, "clip.mp4"), ctx(book.id));
      expect(res.status).toBe(201);
      expect(((await res.json()) as { video: string }).video).toMatch(/\.webm$/);
    });

    it("rejects a non-video file with 415", async () => {
      const book = await makeBook();
      const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
      expect((await animatePage(clipRequest(0, html, "x.mp4"), ctx(book.id))).status).toBe(415);
      expect((await animatePage(clipRequest(0, PNG, "x.mp4"), ctx(book.id))).status).toBe(415);
      expect((await temp.repo.getBookById(book.id))!.pages[0].video).toBeUndefined();
    });

    it("rejects a page without an image (409) and an unknown page (400)", async () => {
      const book = await makeBook();
      expect((await animatePage(clipRequest(1, mp4()), ctx(book.id))).status).toBe(409);
      expect((await animatePage(clipRequest(7, mp4()), ctx(book.id))).status).toBe(400);
      expect((await animatePage(clipRequest(-1, mp4()), ctx(book.id))).status).toBe(400);
    });

    it("rejects an empty or missing file (400) and an oversize one (413)", async () => {
      const book = await makeBook();
      expect((await animatePage(clipRequest(0, new Uint8Array(0)), ctx(book.id))).status).toBe(400);
      expect((await animatePage(clipRequest(0, null), ctx(book.id))).status).toBe(400);
      const big = mp4(25 * 1024 * 1024 + 1);
      expect((await animatePage(clipRequest(0, big), ctx(book.id))).status).toBe(413);
      expect((await temp.repo.getBookById(book.id))!.pages[0].video).toBeUndefined();
    });

    it("refuses a NoDerivatives license, a locked book, another user's book and anonymous calls", async () => {
      const nd = await makeBook({ license: "CC BY-ND 4.0" });
      expect((await animatePage(clipRequest(0, mp4()), ctx(nd.id))).status).toBe(403);
      const locked = await makeBook({ status: "published" });
      expect((await animatePage(clipRequest(0, mp4()), ctx(locked.id))).status).toBe(409);
      expect((await removeClip(jsonRequest("DELETE", { page: 0 }), ctx(locked.id))).status).toBe(409);
      const book = await makeBook();
      currentUser = stranger;
      expect((await animatePage(clipRequest(0, mp4()), ctx(book.id))).status).toBe(404);
      expect((await removeClip(jsonRequest("DELETE", { page: 0 }), ctx(book.id))).status).toBe(404);
      currentUser = null;
      expect((await animatePage(clipRequest(0, mp4()), ctx(book.id))).status).toBe(401);
    });

    it("DELETE removes the clip from the page and the store", async () => {
      const book = await makeBook();
      const { video } = (await (await animatePage(clipRequest(0, mp4()), ctx(book.id))).json()) as { video: string };
      const res = await removeClip(jsonRequest("DELETE", { page: 0 }), ctx(book.id));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { removed: number[] }).removed).toEqual([0]);
      expect((await temp.repo.getBookById(book.id))!.pages[0].video).toBeUndefined();
      expect(await temp.media.get(video)).toBeNull();
      expect((await removeClip(jsonRequest("DELETE", { page: -2 }), ctx(book.id))).status).toBe(400);
    });
  });

  describe("animate: AI", () => {
    beforeEach(() => {
      currentUser = { id: "u_admin", name: "מנהל", role: "admin" };
    });

    it("is admin-only: the book's own parent is refused", async () => {
      const book = await makeBook();
      currentUser = owner;
      const res = await animatePage(jsonRequest("POST", { page: 0 }), ctx(book.id));
      expect(res.status).toBe(403);
      expect((await temp.repo.getBookById(book.id))!.pages[0].video).toBeFalsy();
    });

    it("animates with the mock video provider, labelled mock", async () => {
      const book = await makeBook();
      const res = await animatePage(jsonRequest("POST", { page: 0 }), ctx(book.id));
      const body = (await res.json()) as { status?: string; videoSource?: string; error?: string };
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ status: "animated", videoSource: "mock" });
      const page = (await temp.repo.getBookById(book.id))!.pages[0];
      expect(page.videoSource).toBe("mock");
      expect(page.video).toBeTruthy();
    });

    it("reports a page without an image and validates the body", async () => {
      const book = await makeBook();
      expect((await animatePage(jsonRequest("POST", { page: 1 }), ctx(book.id))).status).toBe(409);
      expect((await animatePage(jsonRequest("POST", { page: "0" }), ctx(book.id))).status).toBe(400);
      expect((await animatePage(jsonRequest("POST", { page: 0, force: true }), ctx(book.id))).status).toBe(400);
    });

    it("rejects a pages array, an overlong note or motion", async () => {
      const book = await makeBook();
      expect((await animatePage(jsonRequest("POST", { page: 0, pages: [0, 1] }), ctx(book.id))).status).toBe(400);
      expect((await animatePage(jsonRequest("POST", { page: 0, notes: "א".repeat(401) }), ctx(book.id))).status).toBe(400);
      expect((await animatePage(jsonRequest("POST", { page: 0, motion: "x".repeat(41) }), ctx(book.id))).status).toBe(400);
    });

    it("puts the motion and the notes into the prompt", async () => {
      const book = await makeBook();
      const res = await animatePage(jsonRequest("POST", { page: 0, motion: "wind", notes: "הציפור מנופפת בכנף" }), ctx(book.id));
      const body = (await res.json()) as { prompt?: string; replacedUserClip?: boolean };
      expect(res.status).toBe(200);
      expect(body.prompt).toContain("light breeze");
      expect(body.prompt).toContain("הציפור מנופפת בכנף");
      expect(body.replacedUserClip).toBe(false);
    });

    it("takes the motion and notes from the book's hero when the request has none", async () => {
      const book = await makeBook();
      await temp.repo.updateBook(book.id, { hero: { description: "ילדה", animationMotion: "slow-camera", animationNotes: "ענן עובר" } });
      const body = (await (await animatePage(jsonRequest("POST", { page: 0 }), ctx(book.id))).json()) as { prompt?: string };
      expect(body.prompt).toContain("push-in");
      expect(body.prompt).toContain("ענן עובר");
    });

    it("refuses to replace an existing clip unless replace is true", async () => {
      const book = await makeBook();
      expect((await animatePage(jsonRequest("POST", { page: 0 }), ctx(book.id))).status).toBe(200);
      const refused = await animatePage(jsonRequest("POST", { page: 0 }), ctx(book.id));
      expect(refused.status).toBe(409);
      const first = (await temp.repo.getBookById(book.id))!.pages[0].video;
      const again = await animatePage(jsonRequest("POST", { page: 0, replace: true }), ctx(book.id));
      expect(again.status).toBe(200);
      expect(await again.json()).toMatchObject({ status: "animated", replacedUserClip: false });
      expect((await temp.repo.getBookById(book.id))!.pages[0].video).toBeTruthy();
      expect(first).toBeTruthy();
    });

    it("needs replace:true to replace a clip the user uploaded, and says so", async () => {
      const book = await makeBook();
      expect((await animatePage(clipRequest(0, mp4()), ctx(book.id))).status).toBe(201);
      const refused = await animatePage(jsonRequest("POST", { page: 0 }), ctx(book.id));
      expect(refused.status).toBe(409);
      expect((await temp.repo.getBookById(book.id))!.pages[0].videoSource).toBeUndefined();
      // With only the demo provider a real (user) clip is never replaced by a demo clip.
      const res = await animatePage(jsonRequest("POST", { page: 0, replace: true }), ctx(book.id));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "skipped", reason: "kept-real-video", replacedUserClip: false });
      expect((await temp.repo.getBookById(book.id))!.pages[0].videoSource).toBeUndefined();
    });
  });
});
