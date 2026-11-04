/** Small helpers for Route Handlers. Server only. */
import "server-only";
import { ZodError } from "zod";
import { AuthError } from "./auth/types";
import type { Locale } from "./i18n/locale";
import { getLocale } from "./i18n/server";
import { translateServerMessage } from "./i18n/server-errors";
import { InvalidMediaPathError } from "./media/url";
import { ConflictError, NotFoundError } from "./repo/types";

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** The visitor's interface language; Hebrew when there is no request to read it from. */
export async function requestLocale(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return "he";
  }
}

/**
 * `{ error: message }` with the given status. The message is written in Hebrew
 * and translated here for English visitors (src/lib/i18n/server-errors.ts);
 * `details` are sent as they are.
 */
export async function jsonError(status: number, message: string, details?: unknown): Promise<Response> {
  const error = translateServerMessage(await requestLocale(), message);
  const body: ApiErrorBody = details === undefined ? { error } : { error, details };
  return Response.json(body, { status });
}

/**
 * Maps a thrown error to a JSON response `{ error }`:
 * AuthError -> 401/403, NotFoundError -> 404, ConflictError -> 409,
 * ZodError / InvalidMediaPathError -> 400, anything else -> 500 (logged).
 */
export async function apiError(err: unknown): Promise<Response> {
  if (err instanceof AuthError) return jsonError(err.status, err.message);
  if (err instanceof NotFoundError) return jsonError(404, "לא נמצא");
  if (err instanceof ConflictError) return jsonError(409, err.message);
  if (err instanceof ZodError) return jsonError(400, "הנתונים שנשלחו אינם תקינים", err.issues);
  if (err instanceof InvalidMediaPathError) return jsonError(400, "נתיב הקובץ אינו תקין");
  console.error("[api] unexpected error", err);
  return jsonError(500, "משהו השתבש. נסו שוב בעוד רגע.");
}
