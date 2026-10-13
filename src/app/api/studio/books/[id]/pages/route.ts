/**
 * PUT: replace all pages of a book (order in the array is the page order).
 * With the header `x-book-updated-at: <updatedAt the client last saw>` the save
 * is conditional: 409 { details: { code: "stale-version" } } when the book
 * changed since, and nothing is written or deleted.
 */
import { jsonOk } from "@/lib/api";
import { readJson, saveOptions, studioApiError, studioContext } from "@/lib/studio/http";
import { saveBookPages } from "@/lib/studio/service";
import { PagesPayloadSchema } from "@/lib/studio/shared";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const payload = PagesPayloadSchema.parse(await readJson(request));
    return jsonOk({ book: await saveBookPages(ctx, id, payload, saveOptions(request)) });
  } catch (err) {
    return studioApiError(err);
  }
}
