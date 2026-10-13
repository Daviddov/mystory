import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { BookStatusInputSchema } from "@/app/admin/_lib/schemas";
import { deleteBookAndMedia, setBookStatus } from "@/app/admin/_lib/service";
import { apiError, jsonOk } from "@/lib/api";
import { getMediaStore } from "@/lib/media";
import { getRepo } from "@/lib/repo";
import { IdSchema } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/**
 * Change the status of any book. Editors and admins. Body: { status, waiveCredits? }.
 * Only an admin may publish a book with missing credits (`waiveCredits`).
 */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  try {
    const user = await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    const { status, waiveCredits } = await readJson(request, BookStatusInputSchema);
    return jsonOk(
      await setBookStatus(await getRepo(), id, status, {
        waiveCredits,
        canWaiveCredits: user.role === "admin",
      }),
    );
  } catch (err) {
    return apiError(err);
  }
}

/** Delete a book and its media. Editors and admins. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    return jsonOk(await deleteBookAndMedia(await getRepo(), await getMediaStore(), id));
  } catch (err) {
    return apiError(err);
  }
}
