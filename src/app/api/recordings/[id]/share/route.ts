/**
 * POST { action: "submit" }: sends an own recording to the admin queue for
 * sharing with every reader. { action: "withdraw" } stops sharing it.
 */
import { z } from "zod";
import { jsonOk } from "@/lib/api";
import { readJsonBody, recordingApiError, recordingContext } from "@/lib/recordings/http";
import { submitRecording, toRecordingView, withdrawRecording } from "@/lib/recordings/service";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const ShareSchema = z.object({ action: z.enum(["submit", "withdraw"]) });

export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const ctx = await recordingContext(request);
    const id = IdSchema.parse((await params).id);
    const { action } = ShareSchema.parse(await readJsonBody(request));
    const recording = action === "submit" ? await submitRecording(ctx, id) : await withdrawRecording(ctx, id);
    return jsonOk({ recording: toRecordingView(recording, ctx.user) });
  } catch (err) {
    return recordingApiError(err);
  }
}
