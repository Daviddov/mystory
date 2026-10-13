/** Request helpers shared by the import routes. Server only. */
import "server-only";

/** An upload that was refused before it was processed. `message` is Hebrew and safe to show. */
export class UploadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

/**
 * Refuses browser requests that come from another site (AuthError 403, which
 * importApiError() turns into a JSON 403). The rules live in one place for
 * every route family: ../same-origin.
 */
export { assertSameOrigin } from "../same-origin";

/**
 * Reads the request body with a hard byte cap (the Content-Length header is
 * only a hint and may be missing), so an oversized upload is cut off instead
 * of being buffered in memory.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new UploadError(413, "הקובץ גדול מדי.");
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Parses a multipart form with a hard cap on the whole request body. */
export async function readFormDataWithLimit(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new UploadError(415, "סוג הבקשה אינו נתמך.");
  }
  const body = await readBodyWithLimit(request, maxBytes);
  try {
    return await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new UploadError(400, "לא הצלחנו לקרוא את הקבצים שנשלחו.");
  }
}

/** The uploaded files of one form field (string values are ignored). */
export function formFiles(form: FormData, field: string): File[] {
  return form.getAll(field).filter((value): value is File => typeof value !== "string");
}
