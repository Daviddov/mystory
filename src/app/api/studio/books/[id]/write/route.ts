/**
 * POST /api/studio/books/<id>/write
 *
 *   { idea: string, ageGroup?: "0-2"|"3-5"|"6-8", heroName?: string, heroGender?: "boy"|"girl", category?: string }
 *       Writes the pages of a story from the idea, in the house voice (rhymed, Dr. Seuss mechanisms).
 *       -> { pages: [{ text, illustrationPrompt }], isMock, notes }
 *
 * The book is not changed: the editor puts the pages in and saves, as with a
 * pasted story. Independent of the hero, pictures and narration.
 * Owner, editor or admin; refused for a locked book like every other edit.
 */
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { getTextProvider } from "@/lib/ai";
import { cleanFreeText, INPUT_LIMITS } from "@/lib/generation/input";
import { rateLimited } from "@/lib/rate-limit";
import { CATEGORY_SLUGS } from "@/lib/taxonomy";
import { AgeGroupSchema } from "@/lib/types";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook } from "@/lib/studio/service";
import { writeStory, WriteStoryError } from "@/lib/studio/write";

export const dynamic = "force-dynamic";
/** Outline, pages and a review are three or four model calls. */
export const maxDuration = 180;

const BodySchema = z.strictObject({
  idea: z
    .string()
    .max(INPUT_LIMITS.idea * 4)
    .transform(cleanFreeText)
    .pipe(z.string().min(INPUT_LIMITS.ideaMin, "כתבו כמה מילים על הסיפור").max(INPUT_LIMITS.idea)),
  ageGroup: AgeGroupSchema.optional(),
  heroName: z
    .string()
    .max(INPUT_LIMITS.childName * 4)
    .transform(cleanFreeText)
    .pipe(z.string().max(INPUT_LIMITS.childName))
    .optional(),
  heroGender: z.enum(["boy", "girl"]).optional(),
  category: z
    .string()
    .refine((slug) => CATEGORY_SLUGS.includes(slug), "unknown category")
    .optional(),
});

/** Books being written right now, so a double click does not pay twice. */
const running = new Set<string>();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const body = BodySchema.parse(await readJson(request));
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);

    if (running.has(book.id)) return jsonError(409, "הסיפור כבר בכתיבה. חכו שיסתיים.");
    const limited = rateLimited("WRITE", { request, user: ctx.user });
    if (limited) return limited;

    running.add(book.id);
    try {
      const story = await writeStory(
        { text: await getTextProvider() },
        { ...body, ageGroup: body.ageGroup ?? book.ageGroup },
      );
      return jsonOk(story);
    } finally {
      running.delete(book.id);
    }
  } catch (err) {
    if (err instanceof WriteStoryError) return jsonError(422, err.message);
    return studioApiError(err);
  }
}
