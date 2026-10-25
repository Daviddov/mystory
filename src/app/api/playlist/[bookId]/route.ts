/**
 * POST   /api/playlist/<bookId> -> { bookId, inPlaylist: true }    adds the book to the user's listening playlist
 * DELETE /api/playlist/<bookId> -> { bookId, inPlaylist: false }
 * Both need a signed-in user; a user only ever changes their own playlist.
 */
import { apiError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { BookIdSchema, NO_STORE, loadViewableBook, rejectCrossOrigin } from "@/components/personal/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ bookId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    // Only books the user may actually open can be added.
    await loadViewableBook({ bookId }, user);
    const repo = await getRepo();
    await repo.addToPlaylist(user.id, bookId);
    return jsonOk({ bookId, inPlaylist: true }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    const repo = await getRepo();
    await repo.removeFromPlaylist(user.id, bookId);
    return jsonOk({ bookId, inPlaylist: false }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
