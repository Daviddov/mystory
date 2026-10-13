import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { CollectionCreateSchema } from "@/app/admin/_lib/schemas";
import { createCollection } from "@/app/admin/_lib/service";
import { apiError, jsonOk } from "@/lib/api";
import { getRepo } from "@/lib/repo";

/** Create a collection. Editors and admins. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const input = await readJson(request, CollectionCreateSchema);
    return jsonOk(await createCollection(await getRepo(), input), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
