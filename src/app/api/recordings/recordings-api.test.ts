/**
 * Family recordings end to end against a temp data directory: record pages
 * from the reader, keep them private, send them for sharing, and the admin
 * decision. Also who may download the audio through /media.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { User } from "@/lib/types";

// The session comes from a cookie in production; here the current user is set directly.
let currentUser: User | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  const requireUser = async () => {
    if (!currentUser) throw new original.AuthError(401);
    return currentUser;
  };
  return {
    ...original,
    getCurrentUser: async () => currentUser,
    requireUser,
    requireRole: async (role: Parameters<typeof original.requireRole>[0]) => {
      const user = await requireUser();
      if (!original.hasRole(user, role)) throw new original.AuthError(403);
      return user;
    },
  };
});

import { GET as mediaGet } from "@/app/media/[...path]/route";
import { recordingsForReader } from "@/lib/recordings/service";
import { POST as reviewRoute } from "../admin/recordings/[id]/review/route";
import * as recordingRoute from "./[id]/route";
import * as pageRoute from "./[id]/pages/[page]/route";
import { POST as shareRoute } from "./[id]/share/route";
import { POST as createRoute } from "./route";

const reader: User = { id: "u_reader", name: "אבא", role: "parent" };
const stranger: User = { id: "u_other", name: "אורח", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

const BASE = "http://localhost:3000";
/** The start of a WebM file: what MediaRecorder produces. */
const WEBM = new Uint8Array(64);
WEBM.set([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

function json(path: string, method: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function upload(id: string, page: number, bytes: Uint8Array): Promise<Response> {
  const form = new FormData();
  form.set("file", new Blob([bytes as BlobPart]), "take");
  const request = new Request(`${BASE}/api/recordings/${id}/pages/${page}`, {
    method: "PUT",
    headers: { Origin: BASE },
    body: form,
  });
  return pageRoute.PUT(request, { params: Promise.resolve({ id, page: String(page) }) });
}

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

type View = { id: string; status: string; mine: boolean; pages: { index: number; audio: string }[] };

async function start(bookId: string): Promise<View> {
  const response = await createRoute(json("/api/recordings", "POST", { bookId }));
  expect(response.status).toBe(201);
  return ((await response.json()) as { recording: View }).recording;
}

function media(path: string) {
  return mediaGet(new Request(`${BASE}/media/${path}`), { params: Promise.resolve({ path: path.split("/") }) });
}

let data: TempData;
let bookId: string;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  currentUser = null;
  const pages = [
    { index: 0, text: "עמוד אחד" },
    { index: 1, text: "עמוד שתיים" },
  ];
  bookId = (await data.repo.createBook({ title: "ספר", ownerId: "system", status: "published", pages })).id;
});

afterEach(async () => {
  await data.cleanup();
});

describe("recordings API", () => {
  it("needs a signed-in reader", async () => {
    expect((await createRoute(json("/api/recordings", "POST", { bookId }))).status).toBe(401);
  });

  it("records pages into a private recording that only its maker can hear", async () => {
    currentUser = reader;
    const created = await start(bookId);
    expect(created).toMatchObject({ status: "private", mine: true, pages: [] });
    expect(created).not.toHaveProperty("userId");

    const saved = await upload(created.id, 1, WEBM);
    expect(saved.status).toBe(200);
    const view = ((await saved.json()) as { recording: View }).recording;
    expect(view.pages).toHaveLength(1);
    const audio = view.pages[0].audio;
    expect(audio).toMatch(new RegExp(`^books/${bookId}/rec/${created.id}/p1-.+\\.webm$`));

    expect((await media(audio)).status).toBe(200);
    currentUser = stranger;
    expect((await media(audio)).status).toBe(404);
    currentUser = null;
    expect((await media(audio)).status).toBe(404);
    currentUser = editor;
    expect((await media(audio)).status).toBe(200);

    // Others do not get it as a narration version.
    expect(await recordingsForReader(data.repo, bookId, stranger)).toEqual([]);
    expect((await recordingsForReader(data.repo, bookId, reader)).map((v) => v.id)).toEqual([created.id]);
  });

  it("replaces an earlier take and removes its file", async () => {
    currentUser = reader;
    const { id } = await start(bookId);
    const first = ((await (await upload(id, 2, WEBM)).json()) as { recording: View }).recording.pages[0].audio;
    const second = ((await (await upload(id, 2, WEBM)).json()) as { recording: View }).recording.pages;
    expect(second).toHaveLength(1);
    expect(second[0].audio).not.toBe(first);
    expect(await data.media.get(first)).toBeNull();
  });

  it("refuses what is not audio, pages that do not exist and recordings of someone else", async () => {
    currentUser = reader;
    const { id } = await start(bookId);
    expect((await upload(id, 1, new TextEncoder().encode("<svg/>"))).status).toBe(415);
    expect((await upload(id, 3, WEBM)).status).toBe(400);
    currentUser = stranger;
    expect((await upload(id, 1, WEBM)).status).toBe(404);
    expect((await recordingRoute.DELETE(json(`/api/recordings/${id}`, "DELETE"), idCtx(id))).status).toBe(404);
  });

  it("shares through the admin queue: approve makes it a version for everyone", async () => {
    currentUser = reader;
    const { id } = await start(bookId);
    expect((await shareRoute(json(`/api/recordings/${id}/share`, "POST", { action: "submit" }), idCtx(id))).status).toBe(400);
    const audio = ((await (await upload(id, 1, WEBM)).json()) as { recording: View }).recording.pages[0].audio;
    const submitted = await shareRoute(json(`/api/recordings/${id}/share`, "POST", { action: "submit" }), idCtx(id));
    expect(((await submitted.json()) as { recording: View }).recording.status).toBe("pending");

    // Still private while it waits.
    currentUser = null;
    expect((await media(audio)).status).toBe(404);

    currentUser = reader;
    const review = json(`/api/admin/recordings/${id}/review`, "POST", { action: "approve" });
    expect((await reviewRoute(review, idCtx(id))).status).toBe(403);

    currentUser = editor;
    const stale = json(`/api/admin/recordings/${id}/review`, "POST", { action: "approve", updatedAt: "2000-01-01" });
    expect((await reviewRoute(stale, idCtx(id))).status).toBe(409);
    const approved = await reviewRoute(json(`/api/admin/recordings/${id}/review`, "POST", { action: "approve" }), idCtx(id));
    expect(await approved.json()).toEqual({ id, status: "approved" });

    currentUser = null;
    expect((await media(audio)).status).toBe(200);
    const versions = await recordingsForReader(data.repo, bookId, stranger);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ id, mine: false, status: "approved" });

    // A new take stops the sharing until it is approved again.
    currentUser = reader;
    const changed = ((await (await upload(id, 2, WEBM)).json()) as { recording: View }).recording;
    expect(changed.status).toBe("private");
    expect(await recordingsForReader(data.repo, bookId, stranger)).toEqual([]);
  });

  it("returns a rejected recording to its maker with the note", async () => {
    currentUser = reader;
    const { id } = await start(bookId);
    await upload(id, 1, WEBM);
    await shareRoute(json(`/api/recordings/${id}/share`, "POST", { action: "submit" }), idCtx(id));
    currentUser = editor;
    const rejected = json(`/api/admin/recordings/${id}/review`, "POST", { action: "reject", note: "יש רעש ברקע" });
    expect((await reviewRoute(rejected, idCtx(id))).status).toBe(200);
    const stored = await data.repo.getRecording(id);
    expect(stored).toMatchObject({ status: "private", reviewNote: "יש רעש ברקע" });
    const [view] = await recordingsForReader(data.repo, bookId, reader);
    expect(view.reviewNote).toBe("יש רעש ברקע");
  });

  it("deletes a recording with its audio", async () => {
    currentUser = reader;
    const { id } = await start(bookId);
    const audio = ((await (await upload(id, 1, WEBM)).json()) as { recording: View }).recording.pages[0].audio;
    expect((await recordingRoute.DELETE(json(`/api/recordings/${id}`, "DELETE"), idCtx(id))).status).toBe(200);
    expect(await data.repo.getRecording(id)).toBeNull();
    expect(await data.media.get(audio)).toBeNull();
  });

  it("does not share recordings of a book that is not in the library", async () => {
    const privateBook = await data.repo.createBook({
      title: "פרטי",
      ownerId: reader.id,
      status: "private",
      pages: [{ index: 0, text: "שלום" }],
    });
    currentUser = reader;
    const { id } = await start(privateBook.id);
    await upload(id, 1, WEBM);
    const response = await shareRoute(json(`/api/recordings/${id}/share`, "POST", { action: "submit" }), idCtx(id));
    expect(response.status).toBe(409);
    // A stranger cannot start one on that book at all.
    currentUser = stranger;
    expect((await createRoute(json("/api/recordings", "POST", { bookId: privateBook.id }))).status).toBe(404);
  });
});
