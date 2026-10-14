/** Browser calls of the /api/recordings routes. Client-safe. */
import type { RecordingView } from "./service";

export type { RecordingView };

export type RecordingResult = { ok: true; recording: RecordingView } | { ok: false; error: string };

const FALLBACK_ERROR = "משהו השתבש. נסו שוב בעוד רגע.";

async function send(url: string, init: RequestInit): Promise<RecordingResult> {
  try {
    const response = await fetch(url, { credentials: "same-origin", ...init });
    const body = (await response.json().catch(() => null)) as {
      recording?: RecordingView;
      error?: string;
    } | null;
    if (!response.ok || !body?.recording) return { ok: false, error: body?.error || FALLBACK_ERROR };
    return { ok: true, recording: body.recording };
  } catch {
    return { ok: false, error: "אין חיבור לאינטרנט. נסו שוב." };
  }
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function createRecordingRequest(bookId: string, title?: string, token?: string): Promise<RecordingResult> {
  return send("/api/recordings", json("POST", { bookId, title, token }));
}

/** `pageIndex` is zero-based; the URL carries the 1-based page number. */
export function savePageRequest(id: string, pageIndex: number, take: Blob): Promise<RecordingResult> {
  const form = new FormData();
  form.append("file", take, "take");
  return send(`/api/recordings/${id}/pages/${pageIndex + 1}`, {
    method: "PUT",
    body: form,
  });
}

export function deletePageRequest(id: string, pageIndex: number): Promise<RecordingResult> {
  return send(`/api/recordings/${id}/pages/${pageIndex + 1}`, {
    method: "DELETE",
  });
}

export function renameRecordingRequest(id: string, title: string): Promise<RecordingResult> {
  return send(`/api/recordings/${id}`, json("PATCH", { title }));
}

export function shareRecordingRequest(id: string, action: "submit" | "withdraw"): Promise<RecordingResult> {
  return send(`/api/recordings/${id}/share`, json("POST", { action }));
}

export async function deleteRecordingRequest(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/recordings/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return { ok: false, error: body?.error || FALLBACK_ERROR };
  } catch {
    return { ok: false, error: "אין חיבור לאינטרנט. נסו שוב." };
  }
}

export const RECORDING_STATUS_LABELS: Record<RecordingView["status"], string> = {
  private: "רק אצלי",
  pending: "ממתינה לאישור לשיתוף",
  approved: "משותפת עם כולם",
};
