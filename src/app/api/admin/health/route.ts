import { requireAdminApi } from "@/app/admin/_lib/guard";
import { apiError, jsonOk } from "@/lib/api";
import { checkApiKeys } from "@/lib/ai/key-check";

/** Calls each vendor once with the configured keys and reports which are accepted. Admins only. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdminApi(request, "admin");
    return jsonOk({ results: await checkApiKeys() });
  } catch (err) {
    return apiError(err);
  }
}
