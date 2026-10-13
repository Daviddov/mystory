import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { UserRoleInputSchema } from "@/app/admin/_lib/schemas";
import { changeUserRole } from "@/app/admin/_lib/service";
import { apiError, jsonOk } from "@/lib/api";
import { adminEmails } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { IdSchema } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Change a user's role. Admins only. Body: { role }. */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  try {
    const actor = await requireAdminApi(request, "admin");
    const id = IdSchema.parse((await params).id);
    const { role } = await readJson(request, UserRoleInputSchema);
    return jsonOk(await changeUserRole(await getRepo(), actor, id, role, adminEmails()));
  } catch (err) {
    return apiError(err);
  }
}
