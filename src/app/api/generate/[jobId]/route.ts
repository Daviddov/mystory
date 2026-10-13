/**
 * GET /api/generate/<jobId>   progress of a generation job, for polling.
 * Only the job's owner (or an admin) may read it; anyone else gets 404.
 * Response: JobView (see src/lib/generation/server.ts).
 */
import { apiError, jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getJobView } from "@/lib/generation/server";
import { IdSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { jobId } = await context.params;
    const parsed = IdSchema.safeParse(jobId);
    if (!parsed.success) return jsonError(404, "לא נמצא");
    const view = await getJobView(parsed.data, user);
    if (!view) return jsonError(404, "לא נמצא");
    return jsonOk(view, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
