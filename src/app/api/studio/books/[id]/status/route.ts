/**
 * POST { status }: keep private ('private' / 'draft'), submit for publication
 * ('pending'), or publish ('published', editors and admins only).
 */
import { jsonOk } from "@/lib/api";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { setBookStatus } from "@/lib/studio/service";
import { StatusChangeSchema } from "@/lib/studio/shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const { status } = StatusChangeSchema.parse(await readJson(request));
    return jsonOk({ book: await setBookStatus(ctx, id, status) });
  } catch (err) {
    return studioApiError(err);
  }
}
