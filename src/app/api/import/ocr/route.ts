/**
 * POST /api/import/ocr
 * multipart/form-data with one field `image` (JPEG, PNG, GIF or WebP, up to 4MB).
 * Reads the story text of one page with Claude vision. Response: { text, truncated }.
 *
 * Needs ANTHROPIC_API_KEY. Without it the route answers 503 and the import
 * page does not show the option; there is no mock result.
 *
 * Every call is a paid vision request, so it is rate limited per user
 * (RATE_LIMIT_OCR_PER_HOUR, in-process: see @/lib/rate-limit).
 */
import { jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { importApiError } from "@/lib/importers/errors";
import { IMPORT_LIMITS } from "@/lib/importers/limits";
import { detectImageType } from "@/lib/importers/media-sniff";
import { extractPageText, isOcrAvailable, isOcrMediaType } from "@/lib/importers/ocr";
import { assertSameOrigin, formFiles, readFormDataWithLimit, UploadError } from "@/lib/importers/request";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FORM_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!isOcrAvailable()) return jsonError(503, "זיהוי הטקסט לא זמין באתר הזה.");
    const limited = rateLimited("OCR", { request, user });
    if (limited) return limited;

    const form = await readFormDataWithLimit(request, IMPORT_LIMITS.ocrImageBytes + FORM_OVERHEAD_BYTES);
    const [file] = formFiles(form, "image");
    if (!file) throw new UploadError(400, "לא נשלחה תמונה.");
    if (file.size > IMPORT_LIMITS.ocrImageBytes) throw new UploadError(413, "התמונה גדולה מדי לזיהוי טקסט.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = detectImageType(bytes);
    if (!mediaType || !isOcrMediaType(mediaType)) {
      throw new UploadError(415, "אפשר לזהות טקסט רק בתמונות JPEG, PNG, GIF או WebP.");
    }

    const result = await extractPageText(bytes, mediaType);
    return jsonOk({ text: result.text, truncated: result.truncated });
  } catch (err) {
    return importApiError(err);
  }
}
