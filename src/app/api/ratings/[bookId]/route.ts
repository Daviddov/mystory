/**
 * GET    /api/ratings/<bookId>  -> { bookId, average, count, mine: number | null }   (mine needs a signed-in user)
 * PUT    /api/ratings/<bookId> { stars: 1-5, token? } -> { bookId, average, count, mine }   signed-in users only
 * DELETE /api/ratings/<bookId>  -> { bookId, average, count, mine: null }            signed-in users only
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth";
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

const SetSchema = z.object({
  stars: z.number().int().min(1).max(5),
  token: ShareTokenSchema.optional(),
});

async function payload(bookId: string, userId: string | null, mine?: number | null) {
  const repo = await getRepo();
  const summary = await repo.getRatingSummary(bookId);
  const own = mine !== undefined ? mine : userId ? ((await repo.getRating(userId, bookId))?.stars ?? null) : null;
  return { bookId, average: summary.average, count: summary.count, mine: own };
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await getCurrentUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    await loadViewableBook({ bookId }, user);
    return jsonOk(await payload(bookId, user?.id ?? null), { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    const { stars, token } = SetSchema.parse(await readJsonBody(request));
    await loadViewableBook({ bookId }, user, token);
    const repo = await getRepo();
    await repo.setRating(user.id, bookId, stars);
    return jsonOk(await payload(bookId, user.id, stars), { headers: NO_STORE });
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
    await repo.removeRating(user.id, bookId);
    return jsonOk(await payload(bookId, user.id, null), { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
