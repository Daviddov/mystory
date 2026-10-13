/** Client helper for the admin API: JSON in, `{ ok, data | error }` out. Never throws. */
export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string };

const FALLBACK_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";

export async function adminRequest<T = unknown>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<AdminResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : FALLBACK_ERROR;
      return { ok: false, error: message };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: "אין חיבור לשרת. בדקו את הרשת ונסו שוב." };
  }
}
