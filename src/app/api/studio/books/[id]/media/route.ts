/**
 * POST multipart/form-data { kind: "image" | "cover" | "audio", file }.
 * Stores the file in the book's media folder and returns its media path. The
 * book itself is not changed; the editor saves the path with the pages.
 */
import { z } from "zod";
import { jsonOk } from "@/lib/api";
import { studioApiError, studioContext } from "@/lib/studio/http";
import { maxUploadBytes, StudioError, storeUpload } from "@/lib/studio/service";
import { AUDIO_MAX_BYTES, UPLOAD_KINDS } from "@/lib/studio/shared";

export const dynamic = "force-dynamic";

const KindSchema = z.enum(UPLOAD_KINDS);
/** Room for the multipart envelope around the largest accepted file. */
const ENVELOPE_BYTES = 64 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > AUDIO_MAX_BYTES + ENVELOPE_BYTES) {
      throw new StudioError(413, "הקובץ גדול מדי");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new StudioError(400, "הבקשה צריכה להיות טופס עם קובץ");
    }
    const kind = KindSchema.parse(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new StudioError(400, "לא צורף קובץ");
    if (file.size > maxUploadBytes(kind)) throw new StudioError(413, "הקובץ גדול מדי");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeUpload(ctx, id, kind, bytes);
    return jsonOk(stored, { status: 201 });
  } catch (err) {
    return studioApiError(err);
  }
}
