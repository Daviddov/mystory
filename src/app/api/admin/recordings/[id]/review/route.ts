import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { RecordingReviewInputSchema } from "@/app/admin/_lib/schemas";
import { jsonOk } from "@/lib/api";
import { recordingApiError } from "@/lib/recordings/http";
import { reviewRecording } from "@/lib/recordings/service";
import { getRepo } from "@/lib/repo";
import { IdSchema } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/**
 * Review a family recording that waits for sharing. Editors and admins.
 * Body: { action: "approve", updatedAt? } or { action: "reject", note }.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const user = await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    const input = await readJson(request, RecordingReviewInputSchema);
    const recording = await reviewRecording(await getRepo(), user, id, input);
    return jsonOk({ id: recording.id, status: recording.status });
  } catch (err) {
    return recordingApiError(err);
  }
}
