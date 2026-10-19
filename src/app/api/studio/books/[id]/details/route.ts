/**
 * POST /api/studio/books/<id>/details
 *
 *   { fields?: ("title"|"summary"|"categories"|"themes"|"tags"|"discussionQuestions")[] }
 *       Suggests the book's details from its saved pages (one model call).
 *       -> { suggestions: { title?, summary?, categories?, themes?, tags?, discussionQuestions? }, isMock }
 *
 * The book is not changed: the editor merges the suggestions into the fields
 * that are still empty. With the sample (mock) writer there are no suggestions.
 * Owner, editor or admin; refused for a locked book like every other edit.
 */
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { getTextProvider } from "@/lib/ai";
import { rateLimited } from "@/lib/rate-limit";
import { DETAIL_FIELDS, DetailsError, suggestDetails } from "@/lib/studio/details";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook } from "@/lib/studio/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.strictObject({
  fields: z.array(z.enum(DETAIL_FIELDS)).max(DETAIL_FIELDS.length).optional(),
});

/** Books being catalogued right now, so a double click does not pay twice. */
const running = new Set<string>();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const body = BodySchema.parse(await readJson(request));
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);

    if (running.has(book.id)) return jsonError(409, "הפרטים כבר בהכנה. חכו שיסתיים.");
    const limited = rateLimited("DETAILS", { request, user: ctx.user });
    if (limited) return limited;

    running.add(book.id);
    try {
      return jsonOk(await suggestDetails({ text: await getTextProvider() }, book, body.fields));
    } finally {
      running.delete(book.id);
    }
  } catch (err) {
    if (err instanceof DetailsError) return jsonError(422, err.message);
    return studioApiError(err);
  }
}
