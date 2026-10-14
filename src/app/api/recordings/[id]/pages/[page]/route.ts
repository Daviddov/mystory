/**
 * PUT multipart/form-data { file }: stores the take of one page (`page` is
 * 1-based, as in the reader's address). DELETE removes that page's take.
 */
import { z } from "zod";
import { jsonOk } from "@/lib/api";
import { recordingApiError, recordingContext } from "@/lib/recordings/http";
import { RecordingError, deleteRecordingPage, saveRecordingPage, toRecordingView } from "@/lib/recordings/service";
import { AUDIO_MAX_BYTES } from "@/lib/studio/shared";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; page: string }> };

const PageNumberSchema = z.coerce.number().int().min(1).max(10_000);
/** Room for the multipart envelope around the largest accepted file. */
const ENVELOPE_BYTES = 64 * 1024;

async function target(params: Context["params"]) {
  const raw = await params;
  return {
    id: IdSchema.parse(raw.id),
    pageIndex: PageNumberSchema.parse(raw.page) - 1,
  };
}

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  try {
    const ctx = await recordingContext(request);
    const { id, pageIndex } = await target(params);

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > AUDIO_MAX_BYTES + ENVELOPE_BYTES) {
      throw new RecordingError(413, "ההקלטה ארוכה מדי");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new RecordingError(400, "הבקשה צריכה להיות טופס עם קובץ");
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new RecordingError(400, "לא צורפה הקלטה");
    if (file.size > AUDIO_MAX_BYTES) throw new RecordingError(413, "ההקלטה ארוכה מדי");

    const recording = await saveRecordingPage(ctx, id, pageIndex, new Uint8Array(await file.arrayBuffer()));
    return jsonOk({ recording: toRecordingView(recording, ctx.user) });
  } catch (err) {
    return recordingApiError(err);
  }
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    const ctx = await recordingContext(request);
    const { id, pageIndex } = await target(params);
    return jsonOk({
      recording: toRecordingView(await deleteRecordingPage(ctx, id, pageIndex), ctx.user),
    });
  } catch (err) {
    return recordingApiError(err);
  }
}
