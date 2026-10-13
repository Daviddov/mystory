/**
 * GET /me/books?ids=a,b,c -> { books: PublicBook[] }
 *
 * Resolves book ids kept on the device (favorites, reading history) to the
 * card data needed to show them. Works for anonymous visitors; only books the
 * caller may view are returned, in the order of `ids`.
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { canViewBook, getCurrentUser } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { BookIdSchema, MAX_BATCH, NO_STORE, toPublicBook } from "@/components/personal/server";

export const dynamic = "force-dynamic";

const IdsSchema = z.array(BookIdSchema).max(MAX_BATCH);

export async function GET(request: Request): Promise<Response> {
  try {
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = IdsSchema.parse([...new Set(raw.split(",").filter(Boolean))]);
    if (ids.length === 0) return jsonOk({ books: [] }, { headers: NO_STORE });
    const user = await getCurrentUser();
    const repo = await getRepo();
    const { books } = await repo.listBooks({ ids, status: "any" });
    const byId = new Map(books.filter((b) => canViewBook(b, user)).map((b) => [b.id, b]));
    return jsonOk(
      { books: ids.flatMap((id) => (byId.has(id) ? [toPublicBook(byId.get(id)!)] : [])) },
      { headers: NO_STORE },
    );
  } catch (err) {
    return apiError(err);
  }
}
