/**
 * DELETE /api/comments/<bookId>/<commentId> -> { ok: true }
 * The author may delete their own comment; editors and admins may delete any.
 */
import { apiError, jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { canDeleteComment } from "@/lib/comments";
import { getRepo, NotFoundError } from "@/lib/repo";
import { IdSchema } from "@/lib/types";
import { BookIdSchema, NO_STORE, rejectCrossOrigin } from "@/components/personal/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ bookId: string; commentId: string }> };

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const params = await context.params;
    const bookId = BookIdSchema.parse(params.bookId);
    const commentId = IdSchema.parse(params.commentId);
    const repo = await getRepo();
    const comment = await repo.getComment(commentId);
    if (!comment || comment.bookId !== bookId) throw new NotFoundError("comment");
    if (!canDeleteComment(comment, user)) return jsonError(403, "אפשר למחוק רק תגובות שכתבתם");
    await repo.deleteComment(commentId);
    return jsonOk({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
