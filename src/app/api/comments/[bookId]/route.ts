/**
 * GET  /api/comments/<bookId>?token=           -> { comments: CommentView[] }   newest first, anyone who may view the book
 * POST /api/comments/<bookId> { body, token? } -> { comment: CommentView }      signed-in users only
 *
 * Comments are plain text. The author is shown by display name, never by e-mail.
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { authorDisplayName, toCommentView } from "@/lib/comments";
import { rateLimited } from "@/lib/rate-limit";
import { getRepo } from "@/lib/repo";
import { CommentBodySchema } from "@/lib/types";
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

const CreateSchema = z.object({
  body: CommentBodySchema,
  token: ShareTokenSchema.optional(),
});

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await getCurrentUser();
    const bookId = BookIdSchema.parse((await context.params).bookId);
    const rawToken = new URL(request.url).searchParams.get("token");
    const token = rawToken ? ShareTokenSchema.parse(rawToken) : null;
    await loadViewableBook({ bookId }, user, token);
    const repo = await getRepo();
    const comments = await repo.listComments(bookId);
    return jsonOk({ comments: comments.map((c) => toCommentView(c, user)) }, { headers: NO_STORE });
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
    const { body, token } = CreateSchema.parse(await readJsonBody(request));
    await loadViewableBook({ bookId }, user, token);
    const limited = rateLimited("COMMENTS", { user, request });
    if (limited) return limited;
    const repo = await getRepo();
    const comment = await repo.addComment({ bookId, userId: user.id, authorName: authorDisplayName(user), body });
    return jsonOk({ comment: toCommentView(comment, user) }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
