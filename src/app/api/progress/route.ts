/**
 * GET  /api/progress                      -> { progress: Progress[] }            (most recent first)
 * GET  /api/progress?bookId=… | ?slug=…   -> { progress: Progress | null }
 * POST /api/progress { bookId | slug, pageIndex, completed?, token? }  -> { progress: Progress }
 * POST /api/progress { items: [{ bookId, pageIndex, completed?, updatedAt? }] }
 *        -> merges device progress into the account; the newer position wins.
 * All need a signed-in user; a user only ever reads and writes their own rows.
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { canViewBook, requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import type { Progress } from "@/lib/types";
import {
  BookIdSchema,
  BookSlugSchema,
  MAX_BATCH,
  NO_STORE,
  ShareTokenSchema,
  loadViewableBook,
  readJsonBody,
  rejectCrossOrigin,
} from "@/components/personal/server";

export const dynamic = "force-dynamic";

const PageIndexSchema = z.number().int().min(0).max(10_000);

const QuerySchema = z.object({
  bookId: BookIdSchema.optional(),
  slug: BookSlugSchema.optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const query = QuerySchema.parse({
      bookId: url.searchParams.get("bookId") ?? undefined,
      slug: url.searchParams.get("slug") ?? undefined,
    });
    const repo = await getRepo();
    if (query.bookId || query.slug) {
      let bookId = query.bookId;
      if (!bookId && query.slug) bookId = (await repo.getBookBySlug(query.slug))?.id;
      const progress = bookId ? await repo.getProgress(user.id, bookId) : null;
      return jsonOk({ progress }, { headers: NO_STORE });
    }
    return jsonOk({ progress: await repo.listProgress(user.id) }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}

const SingleSchema = z
  .object({
    bookId: BookIdSchema.optional(),
    slug: BookSlugSchema.optional(),
    pageIndex: PageIndexSchema,
    completed: z.boolean().optional(),
    token: ShareTokenSchema.optional(),
  })
  .refine((value) => !!value.bookId || !!value.slug, { message: "bookId or slug is required" });

const BatchSchema = z.object({
  items: z
    .array(
      z.object({
        bookId: BookIdSchema,
        pageIndex: PageIndexSchema,
        completed: z.boolean().optional(),
        updatedAt: z.string().max(40).optional(),
      }),
    )
    .max(MAX_BATCH),
});

function clampPage(pageIndex: number, pageCount: number): number {
  return pageCount > 0 ? Math.min(pageIndex, pageCount - 1) : 0;
}

function timeOf(value: string | undefined): number {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const body = await readJsonBody(request);
    const repo = await getRepo();

    if (body && typeof body === "object" && "items" in body) {
      const { items } = BatchSchema.parse(body);
      const merged: Progress[] = [];
      const skipped: string[] = [];
      for (const item of items) {
        const book = await repo.getBookById(item.bookId);
        if (!book || !canViewBook(book, user)) {
          skipped.push(item.bookId);
          continue;
        }
        const existing = await repo.getProgress(user.id, item.bookId);
        const completed = !!item.completed || !!existing?.completed;
        // A device position replaces the account one only when it is newer.
        const deviceIsNewer = !existing || timeOf(item.updatedAt) > timeOf(existing.updatedAt);
        if (deviceIsNewer) {
          merged.push(
            await repo.setProgress(user.id, book.id, clampPage(item.pageIndex, book.pages.length), completed),
          );
        } else if (completed !== existing.completed) {
          merged.push(await repo.setProgress(user.id, book.id, existing.pageIndex, completed));
        } else {
          merged.push(existing);
        }
      }
      return jsonOk({ progress: merged, skipped }, { headers: NO_STORE });
    }

    const input = SingleSchema.parse(body);
    const book = await loadViewableBook({ bookId: input.bookId, slug: input.slug }, user, input.token);
    const progress = await repo.setProgress(
      user.id,
      book.id,
      clampPage(input.pageIndex, book.pages.length),
      input.completed,
    );
    return jsonOk({ progress }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
