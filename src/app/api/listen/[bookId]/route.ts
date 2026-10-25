/**
 * GET /api/listen/<bookId>  -> PlayerBook
 *
 * A published, narrated book in the shape the reader needs, for the "watch with
 * pictures" mode of the bedtime listening page. Unpublished books and books
 * without narration answer 404.
 */
import { jsonError } from "@/lib/api";
import { toPlayerBook } from "@/lib/reader/logic";
import { getRepo } from "@/lib/repo";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bookId: string }> }): Promise<Response> {
  const parsed = IdSchema.safeParse((await context.params).bookId);
  if (!parsed.success) return jsonError(404, "לא נמצא");
  const repo = await getRepo();
  const book = await repo.getBookById(parsed.data);
  if (!book || book.status !== "published" || !book.pages.some((page) => !!page.audio)) {
    return jsonError(404, "לא נמצא");
  }
  return Response.json(toPlayerBook(book));
}
