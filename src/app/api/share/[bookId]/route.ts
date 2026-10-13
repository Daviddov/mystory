/**
 * Share links for a book. Only the owner of the book may call these.
 *
 * GET    /api/share/<bookId>               -> { bookId, token: string | null, path, url }
 * POST   /api/share/<bookId> { rotate? }   -> creates the link (or returns the existing one;
 *                                             rotate: true replaces it with a new token)
 * DELETE /api/share/<bookId>               -> revokes the link
 */
import { z } from "zod";
import { apiError, jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { newShareToken } from "@/lib/ids";
import { getRepo, NotFoundError } from "@/lib/repo";
import { routes } from "@/lib/routes";
import type { BookWithPages, User } from "@/lib/types";
import { BookIdSchema, NO_STORE, readJsonBody, rejectCrossOrigin } from "@/components/personal/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ bookId: string }> };

const CreateSchema = z.object({ rotate: z.boolean().optional() });

/** Loads the book and enforces "owner only". Non-owners get 404 so private books stay hidden. */
async function loadOwnedBook(context: Context, user: User): Promise<BookWithPages> {
  const bookId = BookIdSchema.parse((await context.params).bookId);
  const repo = await getRepo();
  const book = await repo.getBookById(bookId);
  if (!book || book.ownerId !== user.id) throw new NotFoundError("book");
  return book;
}

function shareBody(request: Request, bookId: string, token: string | null) {
  const path = token ? routes.share(token) : null;
  let origin: string;
  try {
    origin = new URL(request.url).origin;
  } catch {
    origin = siteUrl();
  }
  // Prefer the configured public address; fall back to the address of this request.
  const base = process.env.NEXT_PUBLIC_SITE_URL ? siteUrl() : origin;
  return { bookId, token, path, url: path ? new URL(path, base).toString() : null };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireUser();
    const book = await loadOwnedBook(context, user);
    return jsonOk(shareBody(request, book.id, book.shareToken ?? null), { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const book = await loadOwnedBook(context, user);
    const { rotate } = CreateSchema.parse(await readJsonBody(request));
    if (book.pages.length === 0) return jsonError(400, "אי אפשר לשתף ספר בלי עמודים");

    let token = book.shareToken;
    if (!token || rotate) {
      token = newShareToken();
      const repo = await getRepo();
      await repo.updateBook(book.id, { shareToken: token });
    }
    return jsonOk(shareBody(request, book.id, token), { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const book = await loadOwnedBook(context, user);
    if (book.shareToken) {
      const repo = await getRepo();
      // An explicit undefined removes the optional field.
      await repo.updateBook(book.id, { shareToken: undefined });
    }
    return jsonOk(shareBody(request, book.id, null), { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
