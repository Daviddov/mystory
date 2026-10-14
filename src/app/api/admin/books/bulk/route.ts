import { bulkPublish, bulkUpdateMeta } from "@/app/admin/_lib/bulk";
import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { BulkBooksInputSchema } from "@/app/admin/_lib/schemas";
import { apiError, jsonOk } from "@/lib/api";
import { getMediaStore } from "@/lib/media";
import { getRepo } from "@/lib/repo";

/**
 * One action on many books. Editors and admins.
 * Body: { action: "publish", ids } or
 *       { action: "meta", ids, mode?: "add" | "replace", ageGroup?, categories?, themes? }.
 * Answers { results: [{ id, ok, error? }] }: a refused book is reported and
 * the others are still handled.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireAdminApi(request, "editor");
    const input = await readJson(request, BulkBooksInputSchema);
    const [repo, media] = await Promise.all([getRepo(), getMediaStore()]);
    const ctx = { repo, media, user };
    const results =
      input.action === "publish" ? await bulkPublish(ctx, input.ids) : await bulkUpdateMeta(ctx, input.ids, input);
    return jsonOk({ results });
  } catch (err) {
    return apiError(err);
  }
}
