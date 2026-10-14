/**
 * Browser-side calls of the studio editor. Client-safe.
 *
 * The narration endpoints (/api/narration/...) belong to another module and
 * may be missing; those calls report `available: false` instead of throwing.
 */
import type { BookWithPages, Page } from "../types";
import type { BookMetaPatch, CreateBookInput, PublishProblem, UploadKind } from "./shared";

export class StudioApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "StudioApiError";
  }

  /** True when the save was refused because the book changed elsewhere since this tab loaded it. */
  get conflict(): boolean {
    return (
      this.status === 409 &&
      !!this.details &&
      typeof this.details === "object" &&
      (this.details as { code?: unknown }).code === "stale-version"
    );
  }

  /** True when trying again later could help (network failure or server error). */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

const NETWORK_MESSAGE = "אין חיבור לשרת. בדקו את החיבור לאינטרנט.";

function defaultMessage(status: number): string {
  if (status === 401) return "פג תוקף ההתחברות. התחברו שוב כדי להמשיך.";
  if (status === 403) return "אין לך הרשאה לפעולה הזאת";
  if (status === 404) return "הספר לא נמצא";
  if (status === 413) return "הקובץ גדול מדי";
  return "משהו השתבש. נסו שוב בעוד רגע.";
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: "same-origin", ...init });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new StudioApiError(0, NETWORK_MESSAGE);
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await send(url, init);
  const body = await readBody(response);
  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; details?: unknown };
    const message = typeof record.error === "string" ? record.error : defaultMessage(response.status);
    throw new StudioApiError(response.status, message, record.details);
  }
  return body as T;
}

function json(method: string, data: unknown, extra: RequestInit = {}): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), ...extra };
}

const bookUrl = (id: string) => `/api/studio/books/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------------------
// Studio API
// ---------------------------------------------------------------------------

export async function createBook(input: CreateBookInput): Promise<BookWithPages> {
  return (await request<{ book: BookWithPages }>("/api/studio/books", json("POST", input))).book;
}

export async function fetchBook(id: string): Promise<BookWithPages> {
  return (await request<{ book: BookWithPages }>(bookUrl(id), { cache: "no-store" })).book;
}

/** Requests small enough for `keepalive`, so a save started while the tab closes still arrives. */
const KEEPALIVE_LIMIT = 60_000;

function keepaliveFor(body: string): RequestInit {
  return body.length < KEEPALIVE_LIMIT / 3 ? { keepalive: true } : {};
}

/** Adds the version a save is based on (see BOOK_VERSION_HEADER on the server). */
function versioned(init: RequestInit, baseUpdatedAt: string | undefined): RequestInit {
  if (!baseUpdatedAt) return init;
  return { ...init, headers: { ...(init.headers as Record<string, string>), "x-book-updated-at": baseUpdatedAt } };
}

/**
 * `baseUpdatedAt` is the `updatedAt` of the book this tab last saw. The server
 * refuses the save (StudioApiError.conflict) when the book changed since.
 */
export async function patchBookMeta(id: string, patch: BookMetaPatch, baseUpdatedAt?: string): Promise<BookWithPages> {
  const init = versioned(json("PATCH", patch), baseUpdatedAt);
  return (await request<{ book: BookWithPages }>(bookUrl(id), { ...init, ...keepaliveFor(init.body as string) })).book;
}

export async function putBookPages(
  id: string,
  pages: Omit<Page, "index">[],
  baseUpdatedAt?: string,
): Promise<BookWithPages> {
  const init = versioned(json("PUT", { pages }), baseUpdatedAt);
  return (
    await request<{ book: BookWithPages }>(`${bookUrl(id)}/pages`, { ...init, ...keepaliveFor(init.body as string) })
  ).book;
}

export async function deleteBook(id: string): Promise<void> {
  await request<{ ok: true }>(bookUrl(id), { method: "DELETE" });
}

export interface UploadResult {
  path: string;
  url: string;
  contentType: string;
  size: number;
}

export async function uploadMedia(id: string, kind: UploadKind, file: Blob, fileName = "upload"): Promise<UploadResult> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file, fileName);
  return request<UploadResult>(`${bookUrl(id)}/media`, { method: "POST", body: form });
}

export async function setBookStatus(id: string, status: BookWithPages["status"]): Promise<BookWithPages> {
  return (await request<{ book: BookWithPages }>(`${bookUrl(id)}/status`, json("POST", { status }))).book;
}

/** The checklist the server sends with a refused submission, when there is one. */
export function problemsFromError(err: unknown): PublishProblem[] {
  if (!(err instanceof StudioApiError) || !Array.isArray(err.details)) return [];
  return err.details.filter(
    (item): item is PublishProblem =>
      !!item && typeof item === "object" && typeof (item as PublishProblem).message === "string",
  );
}

export async function createShareLink(id: string): Promise<BookWithPages> {
  return (await request<{ book: BookWithPages }>(`${bookUrl(id)}/share`, { method: "POST" })).book;
}

export async function removeShareLink(id: string): Promise<BookWithPages> {
  return (await request<{ book: BookWithPages }>(`${bookUrl(id)}/share`, { method: "DELETE" })).book;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

export interface TranslationOutcome {
  /** 'mock': no translation service is configured and the book was NOT changed. */
  status: "translated" | "accepted" | "mock";
  isMock: boolean;
  book: BookWithPages;
}

/** Translates the whole book into Hebrew on the server (one AI call; it can take a minute or two). */
export async function translateBookToHebrew(id: string, translator: string): Promise<TranslationOutcome> {
  return request<TranslationOutcome>(`${bookUrl(id)}/translate`, json("POST", { action: "translate", translator }));
}

/** Marks a hand-made translation as done: the book becomes a Hebrew book. */
export async function acceptTranslation(id: string, translator: string): Promise<TranslationOutcome> {
  return request<TranslationOutcome>(`${bookUrl(id)}/translate`, json("POST", { action: "accept", translator }));
}

export interface HeroImageOutcome {
  path: string;
  url: string;
  description: string;
  style: string;
  /** True when the description was written from the story. */
  descriptionWritten: boolean;
  isMock: boolean;
}

export interface PageIllustrationOutcome {
  path: string;
  url: string;
  scene: string;
  isMock: boolean;
}

/** Draws the hero's reference image. Without a description the server writes one from the saved story. */
export async function createHeroImage(id: string, hero: { description?: string; style?: string }): Promise<HeroImageOutcome> {
  return request<HeroImageOutcome>(`${bookUrl(id)}/illustrate`, json("POST", { target: "hero", ...hero }));
}

/** Illustrates one SAVED page from the saved hero and story. Save (flush) first. */
export async function illustratePage(id: string, page: number, note?: string): Promise<PageIllustrationOutcome> {
  return request<PageIllustrationOutcome>(
    `${bookUrl(id)}/illustrate`,
    json("POST", { target: "page", page, ...(note?.trim() ? { note: note.trim() } : {}) }),
  );
}

// ---------------------------------------------------------------------------
// Narration module (optional)
// ---------------------------------------------------------------------------

export type NikudOutcome =
  | { available: true; text: string; isMock: boolean }
  | { available: false; message: string };

function serviceMissing(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

/** Asks POST /api/narration/nikud to vocalize a text. */
export async function requestNikud(text: string): Promise<NikudOutcome> {
  let response: Response;
  try {
    response = await send("/api/narration/nikud", json("POST", { text }));
  } catch (err) {
    return { available: false, message: err instanceof Error ? err.message : NETWORK_MESSAGE };
  }
  if (serviceMissing(response.status)) {
    return { available: false, message: "שירות הניקוד האוטומטי עדיין לא זמין באתר. אפשר לנקד ידנית." };
  }
  const body = (await readBody(response)) as Record<string, unknown> | undefined;
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : defaultMessage(response.status);
    return { available: false, message };
  }
  const result = typeof body?.text === "string" ? body.text : typeof body?.textNikud === "string" ? body.textNikud : null;
  if (result === null) return { available: false, message: "שירות הניקוד החזיר תשובה לא צפויה" };
  return { available: true, text: result, isMock: body?.isMock === true };
}

export interface NarrationOutcome {
  /** False when the narration endpoint is missing or refused the request. */
  available: boolean;
  message?: string;
  narrated: number;
  skipped: number;
  failed: number;
  /** True when the audio that was produced is the silent demo voice. */
  ttsMock: boolean;
  /** Skip reasons and errors by zero-based page index. */
  pages: { pageIndex: number; status: string; reason?: string; error?: string }[];
}

interface NarrationLine {
  type?: string;
  error?: string;
  ttsMock?: boolean;
  done?: number;
  total?: number;
  result?: { pageIndex?: number; status?: string; reason?: string; error?: string; audioSource?: string };
  summary?: { narrated?: number; skipped?: number; failed?: number; ttsMock?: boolean };
}

/**
 * Runs POST /api/narration/<bookId> for the given pages (all pages when
 * omitted) and follows its NDJSON progress stream. A plain JSON answer is
 * understood as well. The server stores the audio in the book itself, so
 * reload the book afterwards.
 */
export async function narrate(
  bookId: string,
  options: { pages?: number[]; force?: boolean; overwriteRecorded?: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<NarrationOutcome> {
  const outcome: NarrationOutcome = { available: true, narrated: 0, skipped: 0, failed: 0, ttsMock: false, pages: [] };
  let response: Response;
  try {
    response = await send(`/api/narration/${encodeURIComponent(bookId)}`, json("POST", options));
  } catch (err) {
    return { ...outcome, available: false, message: err instanceof Error ? err.message : NETWORK_MESSAGE };
  }
  if (serviceMissing(response.status)) {
    return { ...outcome, available: false, message: "שירות ההקראה האוטומטית עדיין לא זמין באתר. אפשר להקליט בקול שלכם." };
  }
  if (!response.ok) {
    const body = (await readBody(response)) as { error?: unknown } | undefined;
    const message = typeof body?.error === "string" ? body.error : defaultMessage(response.status);
    return { ...outcome, available: false, message };
  }

  let sawSummary = false;
  const handle = (line: NarrationLine) => {
    if (line.type === "start" && line.ttsMock) outcome.ttsMock = true;
    if (line.type === "page" && line.result) {
      const { pageIndex = -1, status = "", reason, error, audioSource } = line.result;
      outcome.pages.push({ pageIndex, status, reason, error });
      if (status === "narrated" && audioSource === "mock") outcome.ttsMock = true;
      if (typeof line.done === "number" && typeof line.total === "number") onProgress?.(line.done, line.total);
    }
    if (line.type === "error") outcome.message = line.error ?? "ההקראה נכשלה";
    const summary = line.type === "done" ? line.summary : line.type === undefined ? (line as NarrationLine["summary"]) : undefined;
    if (summary && typeof summary.narrated === "number") {
      sawSummary = true;
      outcome.narrated = summary.narrated;
      outcome.skipped = summary.skipped ?? 0;
      outcome.failed = summary.failed ?? 0;
      if (summary.ttsMock && summary.narrated > 0) outcome.ttsMock = true;
    }
  };
  const handleText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      handle(JSON.parse(trimmed) as NarrationLine);
    } catch {
      // Not a JSON line: ignore it.
    }
  };

  const reader = response.body?.getReader();
  if (!reader) {
    handleText(await response.text());
  } else {
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleText);
    }
    handleText(buffer + decoder.decode());
  }

  if (!sawSummary) {
    outcome.narrated = outcome.pages.filter((p) => p.status === "narrated").length;
    outcome.skipped = outcome.pages.filter((p) => p.status === "skipped").length;
    outcome.failed = outcome.pages.filter((p) => p.status === "failed").length;
    if (outcome.narrated === 0) outcome.ttsMock = false;
  }
  if (outcome.message && outcome.narrated === 0) outcome.available = false;
  return outcome;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const DOWNSCALE_ABOVE_BYTES = 1_200_000;
const MAX_IMAGE_EDGE = 1800;

/**
 * Shrinks a large photo in the browser before upload (longest edge 1800px,
 * JPEG). Small files, GIFs and anything the browser cannot decode are returned
 * unchanged. This is only for speed; the server validates whatever arrives.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.size < DOWNSCALE_ABOVE_BYTES || file.type === "image/gif" || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: paint white first so transparent PNG areas do not turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
