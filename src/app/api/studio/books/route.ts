/** GET: the signed-in user's books (any status). POST: create an empty draft. */
import { jsonOk } from "@/lib/api";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { createStudioBook, listMyBooks } from "@/lib/studio/service";
import { CreateBookSchema } from "@/lib/studio/shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await studioContext(request);
    return jsonOk({ books: await listMyBooks(ctx) });
  } catch (err) {
    return studioApiError(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await studioContext(request, { mutating: true });
    const input = CreateBookSchema.parse(await readJson(request));
    const book = await createStudioBook(ctx, input);
    return jsonOk({ book }, { status: 201 });
  } catch (err) {
    return studioApiError(err);
  }
}
