/**
 * POST /api/studio/books/<id>/versions/<language>/narrate   { pageIndex, voice?, force? }
 *
 * Narrates ONE page (zero-based) of a language version. The editor calls it page
 * by page, so a long book never hits a request timeout and shows progress.
 * -> { status: "narrated" | "skipped" | "stale", isMock, book }
 */
import { z } from "zod";
import { getTtsProvider } from "@/lib/ai";
import { jsonError, jsonOk } from "@/lib/api";
import { isAllowedNarrationVoice } from "@/lib/narration/voices";
import { rateLimited } from "@/lib/rate-limit";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook } from "@/lib/studio/service";
import { narrateVersionPage } from "@/lib/translation/versions";
import { BookLanguageSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.strictObject({
  pageIndex: z.number().int().min(0).max(999),
  voice: z.string().max(64).optional(),
  force: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; language: string }> },
): Promise<Response> {
  try {
    const { id, language: rawLanguage } = await params;
    const language = BookLanguageSchema.safeParse(rawLanguage);
    if (!language.success) return jsonError(400, "שפה לא מוכרת");
    const ctx = await studioContext(request, { mutating: true });
    const body = BodySchema.parse(await readJson(request));
    if (body.voice && !isAllowedNarrationVoice(body.voice)) return jsonError(400, "הקול שנבחר לא זמין");
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);
    const limited = await rateLimited("NARRATE_VERSION", { request, user: ctx.user });
    if (limited) return limited;
    const result = await narrateVersionPage(
      { repo: ctx.repo, media: ctx.media, tts: await getTtsProvider() },
      book.id,
      language.data,
      body.pageIndex,
      { voice: body.voice, force: body.force },
    );
    return jsonOk(result);
  } catch (err) {
    return studioApiError(err);
  }
}
