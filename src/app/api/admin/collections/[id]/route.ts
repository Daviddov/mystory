import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { CollectionUpdateSchema } from "@/app/admin/_lib/schemas";
import { updateCollection } from "@/app/admin/_lib/service";
import { apiError, jsonOk } from "@/lib/api";
import { getRepo } from "@/lib/repo";
import { IdSchema } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Edit a collection: title, description, slug, season and the ordered book list. Editors and admins. */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    const input = await readJson(request, CollectionUpdateSchema);
    return jsonOk(await updateCollection(await getRepo(), id, input));
  } catch (err) {
    return apiError(err);
  }
}

/** Delete a collection (the books stay). Editors and admins. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    await (await getRepo()).deleteCollection(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
