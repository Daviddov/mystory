/**
 * GET /api/library?scope=<scope>&<library query>&page=<n>  -> ListingPageResponse
 *
 * The next pages of a book listing, for infinite scroll (InfiniteBookGrid).
 * `scope` names the listing page (see @/components/library/infinite); the
 * other keys are the listing's own query string (sort, age, q, filters).
 * Published books only, public fields only. Pages are PAGE_SIZE (24) books.
 *
 * Answers are the same for every visitor and briefly cacheable, except on the
 * all-books listing of a signed-in reader ("read" filter and check marks).
 */
import { apiError, jsonError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { RawSearchParams } from "@/components/library/filters";
import { parseScope } from "@/components/library/infinite";
import { loadListingPage } from "@/components/library/listing";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const scope = parseScope(url.searchParams.get("scope"));
    if (!scope) return jsonError(400, "הרשימה לא נמצאה");

    const raw: RawSearchParams = {};
    for (const key of new Set(url.searchParams.keys())) {
      if (key !== "scope") raw[key] = url.searchParams.get(key) ?? undefined;
    }
    const loaded = await loadListingPage(scope, raw, getCurrentUser);
    if (!loaded) return jsonError(404, "הרשימה לא נמצאה");

    return Response.json(loaded.body, {
      headers: {
        "Cache-Control": loaded.personal ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
