/** PATCH { title }: renames an own recording. DELETE: removes it with its audio. */
import { z } from "zod";
import { jsonOk } from "@/lib/api";
import { readJsonBody, recordingApiError, recordingContext } from "@/lib/recordings/http";
import { deleteRecording, renameRecording, toRecordingView } from "@/lib/recordings/service";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const RenameSchema = z.object({ title: z.string().max(200) });

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  try {
    const ctx = await recordingContext(request);
    const id = IdSchema.parse((await params).id);
    const { title } = RenameSchema.parse(await readJsonBody(request));
    return jsonOk({
      recording: toRecordingView(await renameRecording(ctx, id, title), ctx.user),
    });
  } catch (err) {
    return recordingApiError(err);
  }
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    const ctx = await recordingContext(request);
    const id = IdSchema.parse((await params).id);
    await deleteRecording(ctx, id);
    return jsonOk({ ok: true });
  } catch (err) {
    return recordingApiError(err);
  }
}
