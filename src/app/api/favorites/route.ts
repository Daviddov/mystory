/**
 * GET  /api/favorites            -> { favorites: Favorite[], bookIds: string[], books: PublicBook[] }
 * POST /api/favorites { bookIds } -> merges device favorites into the account (used after login)
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { canViewBook, requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import {
  BookIdSchema,
  MAX_BATCH,
  NO_STORE,
  readJsonBody,
  rejectCrossOrigin,
  toPublicBook,
} from "@/components/personal/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const repo = await getRepo();
    const favorites = await repo.listFavorites(user.id);
    const ids = favorites.map((f) => f.bookId);
    const { books } = ids.length ? await repo.listBooks({ ids, status: "any" }) : { books: [] };
    const byId = new Map(books.filter((b) => canViewBook(b, user)).map((b) => [b.id, b]));
    const visible = favorites.filter((f) => byId.has(f.bookId));
    return jsonOk(
      {
        favorites: visible,
        bookIds: visible.map((f) => f.bookId),
        books: visible.map((f) => toPublicBook(byId.get(f.bookId)!)),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return apiError(err);
  }
}

const MergeSchema = z.object({
  bookIds: z.array(BookIdSchema).max(MAX_BATCH),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const user = await requireUser();
    const { bookIds } = MergeSchema.parse(await readJsonBody(request));
    const unique = [...new Set(bookIds)];
    const repo = await getRepo();
    const { books } = unique.length ? await repo.listBooks({ ids: unique, status: "any" }) : { books: [] };
    const allowed = new Set(books.filter((b) => canViewBook(b, user)).map((b) => b.id));
    const added: string[] = [];
    // Oldest first so the newest device favorite ends up newest in the account.
    for (const bookId of [...unique].reverse()) {
      if (!allowed.has(bookId)) continue;
      await repo.addFavorite(user.id, bookId);
      added.push(bookId);
    }
    return jsonOk({ added, skipped: unique.filter((id) => !allowed.has(id)) }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
