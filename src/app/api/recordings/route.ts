/**
 * POST { bookId, title?, token? }: starts a new family recording of a book the
 * caller may read. Returns 201 { recording }.
 */
import { z } from "zod";
import { jsonOk } from "@/lib/api";
import { readJsonBody, recordingApiError, recordingContext } from "@/lib/recordings/http";
import { createRecording, toRecordingView } from "@/lib/recordings/service";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  bookId: IdSchema,
  title: z.string().max(200).optional(),
  token: z.string().max(128).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await recordingContext(request);
    const input = CreateSchema.parse(await readJsonBody(request));
    const recording = await createRecording(ctx, {
      bookId: input.bookId,
      title: input.title,
      shareToken: input.token,
    });
    return jsonOk({ recording: toRecordingView(recording, ctx.user) }, { status: 201 });
  } catch (err) {
    return recordingApiError(err);
  }
}
