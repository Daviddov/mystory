/**
 * POST /api/generate   start an AI book generation (login required).
 *
 * Body, either:
 *   - application/json: the wizard input (see WizardInputSchema), or
 *   - multipart/form-data: field `input` (the same JSON as a string) and an
 *     optional file field `photo` (JPEG, PNG or WebP, up to 5 MB).
 *
 * Responses: 202 { jobId } | 400 invalid input | 401 | 409 a job is already
 * running { jobId } | 413 photo too large | 429 quota used up.
 * Poll GET /api/generate/<jobId> for progress.
 *
 * The photo is read into memory, wrapped in EphemeralPhoto and handed to the
 * pipeline. This handler never writes it anywhere and never logs the request.
 */
import { after } from "next/server";
import { apiError, jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { PHOTO_LIMITS, WizardInputSchema } from "@/lib/generation/input";
import { EphemeralPhoto } from "@/lib/generation/photo";
import { QuotaError, startWizardJob } from "@/lib/generation/server";
import { assertSameOrigin } from "@/lib/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The pipeline keeps running after the response (see `after`), up to this many seconds on serverless hosts. */
export const maxDuration = 300;

const MAX_BODY_BYTES = PHOTO_LIMITS.maxBytes + 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  let photo: EphemeralPhoto | null = null;
  try {
    const user = await requireUser();
    // The session cookie is SameSite=Lax; this additionally rejects cross-origin browser posts.
    assertSameOrigin(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return jsonError(413, "התמונה גדולה מדי. אפשר להעלות תמונה עד 5 מ״ב.");
    }

    let rawInput: unknown;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const inputField = form.get("input");
      if (typeof inputField !== "string" || inputField.length > 20_000) {
        return jsonError(400, "הנתונים שנשלחו אינם תקינים");
      }
      try {
        rawInput = JSON.parse(inputField);
      } catch {
        return jsonError(400, "הנתונים שנשלחו אינם תקינים");
      }
      const file = form.get("photo");
      if (file instanceof File && file.size > 0) {
        if (file.size > PHOTO_LIMITS.maxBytes) {
          return jsonError(413, "התמונה גדולה מדי. אפשר להעלות תמונה עד 5 מ״ב.");
        }
        // The type is decided by the file signature, not by the name or the declared type.
        photo = EphemeralPhoto.from(new Uint8Array(await file.arrayBuffer()));
        if (!photo) return jsonError(400, "אפשר להעלות רק תמונה מסוג JPEG, PNG או WebP.");
      }
    } else {
      const text = await request.text();
      if (text.length > 20_000) return jsonError(400, "הנתונים שנשלחו אינם תקינים");
      try {
        rawInput = JSON.parse(text);
      } catch {
        return jsonError(400, "הנתונים שנשלחו אינם תקינים");
      }
    }

    const input = WizardInputSchema.parse(rawInput);
    const started = await startWizardJob(user, input, photo);
    photo = null; // ownership moved to the job; it destroys the photo when it ends
    after(started.run);
    return jsonOk({ jobId: started.job.id }, { status: 202 });
  } catch (err) {
    if (err instanceof QuotaError) {
      if (err.block === "active") {
        return jsonError(409, err.message, { jobId: err.quota.activeJob?.id });
      }
      return jsonError(429, err.message, { availableAt: err.quota.availableAt });
    }
    return apiError(err);
  } finally {
    photo?.discard();
  }
}
