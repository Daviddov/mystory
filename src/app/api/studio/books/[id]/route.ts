/**
 * One studio book: GET (with pages), PATCH (metadata), DELETE. Owner, editor or admin only.
 * PATCH with the header `x-book-updated-at: <updatedAt the client last saw>` is
 * conditional: 409 when the book changed since.
 */
import { jsonOk } from "@/lib/api";
import { readJson, saveOptions, studioApiError, studioContext } from "@/lib/studio/http";
import { deleteStudioBook, loadEditableBook, updateBookMeta } from "@/lib/studio/service";
import { BookMetaPatchSchema } from "@/lib/studio/shared";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request);
    return jsonOk({ book: await loadEditableBook(ctx, id) });
  } catch (err) {
    return studioApiError(err);
  }
}

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const patch = BookMetaPatchSchema.parse(await readJson(request));
    return jsonOk({ book: await updateBookMeta(ctx, id, patch, saveOptions(request)) });
  } catch (err) {
    return studioApiError(err);
  }
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    await deleteStudioBook(ctx, id);
    return jsonOk({ ok: true });
  } catch (err) {
    return studioApiError(err);
  }
}
