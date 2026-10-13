import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { ReviewInputSchema } from "@/app/admin/_lib/schemas";
import { reviewBook } from "@/app/admin/_lib/service";
import { apiError, jsonOk } from "@/lib/api";
import { getRepo } from "@/lib/repo";
import { IdSchema } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/**
 * Review a pending book. Editors and admins.
 * Body: { action: "approve", waiveCredits? } or { action: "reject", note }.
 * Only an admin may approve a book with missing credits (`waiveCredits`).
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const user = await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    const input = await readJson(request, ReviewInputSchema);
    return jsonOk(
      await reviewBook(await getRepo(), id, input, {
        canWaiveCredits: user.role === "admin",
      }),
    );
  } catch (err) {
    return apiError(err);
  }
}
