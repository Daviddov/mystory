/**
 * GET    /api/favorites/<bookId> -> { bookId, favorite: boolean }
 * POST   /api/favorites/<bookId> -> { bookId, favorite: true, createdAt }   (optional body { token })
 * DELETE /api/favorites/<bookId> -> { bookId, favorite: false }
 * All three need a signed-in user.
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import {
  BookIdSchema,
  NO_STORE,
  ShareTokenSchema,
  loadViewableBook,
  readJsonBody,
  rejectCrossOrigin,
} from "@/components/personal/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ bookId: string }> };

const AddSchema = z.object({ token: ShareTokenSchema.optional() });

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    const repo = await getRepo();
    return jsonOk({ bookId, favorite: await repo.isFavorite(user.id, bookId) }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    const { token } = AddSchema.parse(await readJsonBody(request));
    // Only books the user may actually open can be added.
    await loadViewableBook({ bookId }, user, token);
    const repo = await getRepo();
    const favorite = await repo.addFavorite(user.id, bookId);
    return jsonOk({ bookId, favorite: true, createdAt: favorite.createdAt }, { headers: NO_STORE });
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
    // Idempotent, and scoped to the caller's own favorites.
    await repo.removeFavorite(user.id, bookId);
    return jsonOk({ bookId, favorite: false }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
