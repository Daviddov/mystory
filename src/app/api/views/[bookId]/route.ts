/**
 * POST /api/views/<bookId>  -> { viewCount }
 *
 * Counts one reading of a PUBLISHED book. The reader calls it once per
 * browser session when a book is opened (not on the GET page, so link
 * prefetching does not inflate the "most popular" shelf). No identity is
 * stored: only the counter on the book changes. Unpublished books answer 404
 * and are never counted.
 *
 * Anyone can call this without an account, so it is rate limited per IP
 * address (RATE_LIMIT_VIEWS_PER_HOUR), and one address counts a given book at
 * most once in six hours: a loop cannot push a book up the "popular" shelf.
 * The limiter is in-process (see @/lib/rate-limit).
 */
import { apiError, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, rateLimited } from "@/lib/rate-limit";
import { getRepo } from "@/lib/repo";
import { isSameOriginRequest } from "@/lib/same-origin";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

const ONE_VIEW_PER_BOOK = { limit: 1, windowMs: 6 * 60 * 60 * 1000 };

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }): Promise<Response> {
  try {
    if (!isSameOriginRequest(request)) return jsonError(403, "הבקשה נדחתה");
    const bookId = IdSchema.parse((await context.params).bookId);
    const limited = rateLimited("VIEWS", { request });
    if (limited) return limited;

    const repo = await getRepo();
    const book = await repo.getBookById(bookId);
    if (!book || book.status !== "published") return jsonError(404, "לא נמצא");

    // The same address reading the same book again is not a new reading. An
    // address we cannot tell apart ("unknown": no proxy header) is not deduplicated.
    const ip = clientIp(request);
    if (ip !== "unknown" && !checkRateLimit("VIEW_ONCE", `${ip}|${bookId}`, ONE_VIEW_PER_BOOK).ok) {
      return Response.json({ viewCount: book.viewCount, counted: false });
    }
    return Response.json({ viewCount: await repo.incrementViews(bookId) });
  } catch (err) {
    return apiError(err);
  }
}
