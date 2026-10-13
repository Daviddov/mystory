/**
 * The /api/studio route handlers called directly (no HTTP server). Only
 * requireUser is replaced; the repository and media store are real and run
 * against a temp data directory.
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

import { GET as listBooks, POST as createBook } from "./books/route";
import { DELETE as deleteBook, GET as getBook, PATCH as patchBook } from "./books/[id]/route";
import { POST as uploadMedia } from "./books/[id]/media/route";
import { PUT as putPages } from "./books/[id]/pages/route";
import { DELETE as removeShare, POST as createShare } from "./books/[id]/share/route";
import { POST as setStatus } from "./books/[id]/status/route";

const owner: User = { id: "u_owner", name: "הורה", role: "parent" };
const stranger: User = { id: "u_other", name: "אחר", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function jsonRequest(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/studio/books", {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

function uploadRequest(kind: string, bytes: Uint8Array | null, name = "תמונה ראשונה.png"): Request {
  const form = new FormData();
  form.set("kind", kind);
  if (bytes) form.set("file", new Blob([bytes as BlobPart]), name);
  return new Request("http://localhost/api/studio/books/x/media", { method: "POST", body: form });
}

function png(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

async function bookOf(response: Response): Promise<BookWithPages> {
  return ((await response.json()) as { book: BookWithPages }).book;
}

describe("studio routes", () => {
  let temp: TempData;

  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    temp = await createTempData({ setEnv: true });
    currentUser = owner;
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await temp.cleanup();
  });

  async function newBook(): Promise<BookWithPages> {
    const response = await createBook(jsonRequest("POST", { title: "ספר בדיקה" }));
    expect(response.status).toBe(201);
    return bookOf(response);
  }

  it("requires a signed-in user on every route", async () => {
    const book = await newBook();
    currentUser = null;
    const responses = await Promise.all([
      listBooks(jsonRequest("GET")),
      createBook(jsonRequest("POST", { title: "x" })),
      getBook(jsonRequest("GET"), ctx(book.id)),
      patchBook(jsonRequest("PATCH", { title: "x" }), ctx(book.id)),
      deleteBook(jsonRequest("DELETE"), ctx(book.id)),
      putPages(jsonRequest("PUT", { pages: [] }), ctx(book.id)),
      uploadMedia(uploadRequest("image", png()), ctx(book.id)),
      setStatus(jsonRequest("POST", { status: "private" }), ctx(book.id)),
      createShare(jsonRequest("POST"), ctx(book.id)),
      removeShare(jsonRequest("DELETE"), ctx(book.id)),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(401));
    expect(await temp.repo.getBookById(book.id)).not.toBeNull();
  });

  it("answers 404 for another user's book and lets an editor through", async () => {
    const book = await newBook();
    currentUser = stranger;
    const responses = await Promise.all([
      getBook(jsonRequest("GET"), ctx(book.id)),
      patchBook(jsonRequest("PATCH", { title: "פריצה" }), ctx(book.id)),
      deleteBook(jsonRequest("DELETE"), ctx(book.id)),
      putPages(jsonRequest("PUT", { pages: [] }), ctx(book.id)),
      uploadMedia(uploadRequest("image", png()), ctx(book.id)),
      setStatus(jsonRequest("POST", { status: "private" }), ctx(book.id)),
      createShare(jsonRequest("POST"), ctx(book.id)),
      removeShare(jsonRequest("DELETE"), ctx(book.id)),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(404));
    expect(((await (await listBooks(jsonRequest("GET"))).json()) as { books: unknown[] }).books).toEqual([]);
    expect((await temp.repo.getBookById(book.id))?.title).toBe("ספר בדיקה");

    currentUser = editor;
    expect((await getBook(jsonRequest("GET"), ctx(book.id))).status).toBe(200);
  });

  it("rejects cross-site mutations and malformed input", async () => {
    const book = await newBook();
    const crossSite = await patchBook(jsonRequest("PATCH", { title: "x" }, { Origin: "https://evil.example" }), ctx(book.id));
    expect(crossSite.status).toBe(403);
    expect((await patchBook(jsonRequest("PATCH", "{not json"), ctx(book.id))).status).toBe(400);
    expect((await patchBook(jsonRequest("PATCH", { status: "published" }), ctx(book.id))).status).toBe(400);
    expect((await patchBook(jsonRequest("PATCH", { ownerId: stranger.id }), ctx(book.id))).status).toBe(400);
    expect((await putPages(jsonRequest("PUT", { pages: [{ text: 5 }] }), ctx(book.id))).status).toBe(400);
    expect((await setStatus(jsonRequest("POST", { status: "nope" }), ctx(book.id))).status).toBe(400);
    expect((await createBook(jsonRequest("POST", { title: "  " }))).status).toBe(400);
    expect((await getBook(jsonRequest("GET"), ctx("..%2F..%2Fetc"))).status).toBe(404);
    const stored = await temp.repo.getBookById(book.id);
    expect(stored).toMatchObject({ title: "ספר בדיקה", status: "draft", ownerId: owner.id });
  });

  it("runs the whole flow: details, upload, pages, share, submit, delete", async () => {
    const book = await newBook();

    const upload = await uploadMedia(uploadRequest("image", png()), ctx(book.id));
    expect(upload.status).toBe(201);
    const { path } = (await upload.json()) as { path: string };
    expect(path.startsWith(`books/${book.id}/img-`)).toBe(true);
    expect(await temp.media.get(path)).not.toBeNull();

    expect((await uploadMedia(uploadRequest("image", null), ctx(book.id))).status).toBe(400);
    expect((await uploadMedia(uploadRequest("video", png()), ctx(book.id))).status).toBe(400);
    expect((await uploadMedia(uploadRequest("audio", png()), ctx(book.id))).status).toBe(415);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await uploadMedia(uploadRequest("image", html, "x.png"), ctx(book.id))).status).toBe(415);

    const saved = await bookOf(
      await putPages(jsonRequest("PUT", { pages: [{ text: "היה היה חתול קטן", image: path }, { text: "הסוף" }] }), ctx(book.id)),
    );
    expect(saved.pages).toHaveLength(2);
    expect(saved.pages[0].image).toBe(path);

    const notReady = await setStatus(jsonRequest("POST", { status: "pending" }), ctx(book.id));
    expect(notReady.status).toBe(400);
    expect(((await notReady.json()) as { details: unknown[] }).details.length).toBeGreaterThan(0);

    const patched = await patchBook(
      jsonRequest("PATCH", { summary: "חתול יוצא לטיול", license: "CC BY 4.0", categories: ["animals"], tags: ["חתול"] }),
      ctx(book.id),
    );
    expect(patched.status).toBe(200);

    const shared = await createShare(jsonRequest("POST"), ctx(book.id));
    const sharedBody = (await shared.json()) as { book: BookWithPages; sharePath: string };
    expect(sharedBody.sharePath).toBe(`/share/${sharedBody.book.shareToken}`);
    expect((await bookOf(await removeShare(jsonRequest("DELETE"), ctx(book.id)))).shareToken).toBeUndefined();

    const pending = await bookOf(await setStatus(jsonRequest("POST", { status: "pending" }), ctx(book.id)));
    expect(pending.status).toBe("pending");
    expect(pending.coverImage).toBe(path);
    expect((await setStatus(jsonRequest("POST", { status: "published" }), ctx(book.id))).status).toBe(403);

    // A book that waits for review is locked for its owner: no edit and no delete until it is withdrawn.
    expect((await deleteBook(jsonRequest("DELETE"), ctx(book.id))).status).toBe(409);
    expect((await putPages(jsonRequest("PUT", { pages: [{ text: "טקסט אחר" }] }), ctx(book.id))).status).toBe(409);
    expect((await bookOf(await setStatus(jsonRequest("POST", { status: "private" }), ctx(book.id)))).status).toBe("private");

    expect((await deleteBook(jsonRequest("DELETE"), ctx(book.id))).status).toBe(200);
    expect(await temp.repo.getBookById(book.id)).toBeNull();
    expect(await temp.media.get(path)).toBeNull();
  });
});
