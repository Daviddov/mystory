/** Shared plumbing of the /api/studio route handlers. Server only. */
import "server-only";
import { apiError, jsonError } from "../api";
import { requireUser } from "../auth";
import { getMediaStore } from "../media";
import { getRepo } from "../repo";
import { assertSameOrigin } from "../same-origin";
import { StudioError, type SaveOptions, type StudioContext } from "./service";

/** Request header that carries the `updatedAt` of the book a save is based on. */
export const BOOK_VERSION_HEADER = "x-book-updated-at";

/** The version a save is based on, from the request header. Empty when the client sent none. */
export function saveOptions(request: Request): SaveOptions {
  const value = request.headers.get(BOOK_VERSION_HEADER)?.trim();
  return value && value.length <= 64 ? { baseUpdatedAt: value } : {};
}

/** Rejects cross-site requests (AuthError 403). The rules live in one place: ../same-origin. */
export { assertSameOrigin } from "../same-origin";

/** Authenticates the request and returns what the studio service needs. Throws AuthError(401). */
export async function studioContext(request: Request, options: { mutating?: boolean } = {}): Promise<StudioContext> {
  if (options.mutating) assertSameOrigin(request);
  const user = await requireUser();
  const [repo, media] = await Promise.all([getRepo(), getMediaStore()]);
  return { repo, media, user };
}

/** Parses a JSON body; an unreadable body becomes a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new StudioError(400, "גוף הבקשה אינו JSON תקין");
  }
}

export function studioApiError(err: unknown): Response {
  if (err instanceof StudioError) return jsonError(err.status, err.message, err.details);
  return apiError(err);
}
