/**
 * Push one local book to Supabase (local dev server only).
 *
 * GET  /api/admin/books/<id>/push -> BookPushPlan: what a push would change. Changes nothing.
 * POST /api/admin/books/<id>/push -> BookPushResult: makes Supabase match the local book.
 *
 * Admins only, same-origin. Answers 404 when pushing is not available (production, the app
 * already runs on Supabase, or there is no .env.supabase file).
 */
import { requireAdminApi } from "@/app/admin/_lib/guard";
import { apiError, jsonError, jsonOk } from "@/lib/api";
import { IdSchema } from "@/lib/types";
import { isBookPushAvailable, planBookPush, pushBook } from "@/lib/sync/push-book";

export const dynamic = "force-dynamic";
// Many files can be uploaded; a cut-off push can simply be run again.
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

async function prepare(request: Request, context: Context): Promise<string | Response> {
  await requireAdminApi(request, "admin");
  const id = IdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError(404, "לא נמצא");
  if (!(await isBookPushAvailable())) return jsonError(404, "העלאה ל-Supabase אינה זמינה בסביבה הזו");
  return id.data;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const id = await prepare(request, context);
    if (typeof id !== "string") return id;
    return jsonOk(await planBookPush(id));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const id = await prepare(request, context);
    if (typeof id !== "string") return id;
    return jsonOk(await pushBook(id));
  } catch (err) {
    return apiError(err);
  }
}
