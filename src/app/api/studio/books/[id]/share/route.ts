/** POST: create (or return) the book's share link token. DELETE: revoke it. */
import { jsonOk } from "@/lib/api";
import { routes } from "@/lib/routes";
import { studioApiError, studioContext } from "@/lib/studio/http";
import { createShareLink, removeShareLink } from "@/lib/studio/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const book = await createShareLink(ctx, id);
    return jsonOk({ book, sharePath: book.shareToken ? routes.share(book.shareToken) : null });
  } catch (err) {
    return studioApiError(err);
  }
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    return jsonOk({ book: await removeShareLink(ctx, id), sharePath: null });
  } catch (err) {
    return studioApiError(err);
  }
}
