import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/types";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

const session: { user: User | null } = { user: null };
const afterCallbacks: (() => Promise<unknown>)[] = [];

vi.mock("next/server", () => ({
  after: (callback: () => Promise<unknown>) => {
    afterCallbacks.push(callback);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!session.user) throw new AuthError(401);
    return session.user;
  },
  requireRole: async (role: string) => {
    if (!session.user) throw new AuthError(401);
    if (role === "admin" && session.user.role !== "admin") throw new AuthError(403);
    return session.user;
  },
}));

import { POST } from "./route";
import { GET } from "./[jobId]/route";
import { POST as DAILY } from "./daily/route";

const INPUT = {
  childName: "יואב",
  childGender: "boy",
  childAge: 6,
  hobbies: ["לגו"],
  appearance: "",
  idea: "דרקון קטן שמפחד מאש",
  ageGroup: "6-8",
  category: "fantasy",
  style: "paper-cut",
};
const PARENT: User = { id: "u_parent", name: "הורה", role: "parent" };
const OTHER: User = { id: "u_other", name: "אחר", role: "parent" };
const ADMIN: User = { id: "u_admin", name: "מנהלת", role: "admin" };

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", ...headers },
    body: JSON.stringify(body),
  });
}

function formRequest(photo: Uint8Array | null, type = "image/jpeg"): Request {
  const form = new FormData();
  form.set("input", JSON.stringify(INPUT));
  if (photo) form.set("photo", new File([photo as BlobPart], "ילד.jpg", { type }));
  return new Request("http://localhost/api/generate", { method: "POST", body: form });
}

const getJob = (jobId: string) =>
  GET(new Request(`http://localhost/api/generate/${jobId}`), { params: Promise.resolve({ jobId }) });

let data: TempData;
const saved = { ...process.env };
beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  for (const key of ["ANTHROPIC_API_KEY", "IMAGE_PROVIDER", "TTS_PROVIDER", "NIKUD_PROVIDER", "AI_WEEKLY_QUOTA", "CRON_SECRET"]) {
    delete process.env[key];
  }
  session.user = PARENT;
  afterCallbacks.length = 0;
});
afterEach(async () => {
  await data.cleanup();
  for (const key of ["ANTHROPIC_API_KEY", "IMAGE_PROVIDER", "TTS_PROVIDER", "NIKUD_PROVIDER", "AI_WEEKLY_QUOTA", "CRON_SECRET"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("POST /api/generate", () => {
  it("requires login", async () => {
    session.user = null;
    expect((await POST(jsonRequest(INPUT))).status).toBe(401);
    expect((await getJob("job_x")).status).toBe(401);
  });

  it("rejects invalid input and cross-origin posts", async () => {
    expect((await POST(jsonRequest({ ...INPUT, idea: "" }))).status).toBe(400);
    expect((await POST(jsonRequest({ ...INPUT, extra: 1 }))).status).toBe(400);
    expect((await POST(jsonRequest(INPUT, { origin: "https://evil.example" }))).status).toBe(403);
    expect(await data.repo.listJobs()).toEqual([]);
  });

  it("rejects a file that is not an image", async () => {
    const response = await POST(formRequest(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")));
    expect(response.status).toBe(400);
    expect(await data.repo.listJobs()).toEqual([]);
  });

  it("runs the whole flow with mock providers, and enforces ownership and the weekly quota", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);
    const response = await POST(formRequest(jpeg));
    expect(response.status).toBe(202);
    const { jobId } = (await response.json()) as { jobId: string };

    // The stored job has no child details and no photo.
    const stored = await data.repo.getJob(jobId);
    expect(stored!.input).toEqual({ ageGroup: "6-8", category: "fantasy", style: "paper-cut", hadPhoto: true });

    // While it is queued: a second start is refused with the running job's id.
    const second = await POST(jsonRequest(INPUT));
    expect(second.status).toBe(409);
    expect(((await second.json()) as { details: { jobId: string } }).details.jobId).toBe(jobId);

    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();

    const view = (await (await getJob(jobId)).json()) as {
      status: string;
      progress: number;
      usedMock: boolean;
      mock: { text: boolean; image: boolean };
      book: { id: string; slug: string; pageCount: number };
    };
    expect(view.status).toBe("done");
    expect(view.progress).toBe(100);
    expect(view.usedMock).toBe(true);
    expect(view.mock).toMatchObject({ text: true, image: true });
    expect(view.book.pageCount).toBe(10);

    const book = await data.repo.getBookById(view.book.id);
    expect(book).toMatchObject({ status: "private", origin: "ai", ownerId: PARENT.id });
    expect(book!.pages.every((page) => page.audioSource === "mock")).toBe(true);
    // No file on disk is the photo: every stored file is a generated SVG or the silent demo audio.
    const files = await data.media.list("books");
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => /\.(svg|wav)$/.test(file))).toBe(true);

    // Other users cannot see the job; admins can.
    session.user = OTHER;
    expect((await getJob(jobId)).status).toBe(404);
    session.user = ADMIN;
    expect((await getJob(jobId)).status).toBe(200);

    // Weekly quota: the parent is blocked, another parent and the admin are not.
    session.user = PARENT;
    const blocked = await POST(jsonRequest(INPUT));
    expect(blocked.status).toBe(429);
    process.env.AI_WEEKLY_QUOTA = "2";
    expect((await POST(jsonRequest(INPUT))).status).toBe(202);
    await afterCallbacks[1]();
    expect((await POST(jsonRequest(INPUT))).status).toBe(429);
    session.user = ADMIN;
    expect((await POST(jsonRequest(INPUT))).status).toBe(202);
    await afterCallbacks[2]();
    expect((await POST(jsonRequest(INPUT))).status).toBe(202);
    await afterCallbacks[3]();
  });
});

describe("POST /api/generate/daily", () => {
  const daily = (headers: Record<string, string> = {}) =>
    DAILY(new Request("http://localhost/api/generate/daily", { method: "POST", headers }));

  it("needs an admin or the cron secret, and runs once a day", async () => {
    expect((await daily()).status).toBe(403);
    session.user = null;
    expect((await daily()).status).toBe(401);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await daily({ authorization: "Bearer wrong-value!" })).status).toBe(401);

    const started = await daily({ authorization: "Bearer s3cret-value" });
    expect(started.status).toBe(202);
    await afterCallbacks[0]();
    expect((await data.repo.listBooks({ status: "pending" })).total).toBe(1);

    const again = await daily({ authorization: "Bearer s3cret-value" });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { skipped: boolean }).skipped).toBe(true);
  });
});
