/** Shared plumbing of the /api/recordings route handlers. Server only. */
import "server-only";
import { apiError, jsonError } from "../api";
import { requireUser } from "../auth";
import { getMediaStore } from "../media";
import { getRepo } from "../repo";
import { assertSameOrigin } from "../same-origin";
import { RecordingError, type RecordingContext } from "./service";

/** Every recording route changes something: same-origin and a signed-in user. */
export async function recordingContext(request: Request): Promise<RecordingContext> {
  assertSameOrigin(request);
  const user = await requireUser();
  const [repo, media] = await Promise.all([getRepo(), getMediaStore()]);
  return { repo, media, user };
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RecordingError(400, "גוף הבקשה אינו JSON תקין");
  }
}

export function recordingApiError(err: unknown): Response {
  if (err instanceof RecordingError) return jsonError(err.status, err.message);
  return apiError(err);
}
