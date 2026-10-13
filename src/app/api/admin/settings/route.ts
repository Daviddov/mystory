import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { SettingsInputSchema } from "@/app/admin/_lib/schemas";
import { setBookOfTheWeek } from "@/app/admin/_lib/service";
import { apiError, jsonOk } from "@/lib/api";
import { getRepo } from "@/lib/repo";

/** Choose (or clear, with null) the book of the week. Editors and admins. */
export async function PUT(request: Request): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const { bookOfTheWeekId } = await readJson(request, SettingsInputSchema);
    return jsonOk(await setBookOfTheWeek(await getRepo(), bookOfTheWeekId));
  } catch (err) {
    return apiError(err);
  }
}
