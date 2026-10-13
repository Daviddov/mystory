/**
 * POST /api/studio/books/<id>/translate
 *
 *   { action?: "translate", translator?: string }
 *       Translates the whole book into Hebrew in one AI call and stores it.
 *       -> { status: "translated", isMock: false, book, attempts }
 *       -> { status: "mock", isMock: true, book }   no translation service is
 *          configured: NOTHING was changed; show <MockNotice kind="translation" />.
 *
 *   { action: "accept", translator: string }
 *       Marks a book that was translated by hand as Hebrew (every page must be
 *       in Hebrew; the translator's name is required).
 *       -> { status: "accepted", isMock: false, book }
 *
 * Owner, editor or admin. Like every other edit it is refused for a published
 * book unless the caller is an editor.
 */
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { getTextProvider } from "@/lib/ai";
import { rateLimited } from "@/lib/rate-limit";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook } from "@/lib/studio/service";
import { acceptManualTranslation, MAX_TRANSLATOR_NAME, translateBook, TranslationError } from "@/lib/translation";

export const dynamic = "force-dynamic";
/** One model call for a whole book can take a few minutes. */
export const maxDuration = 300;

const BodySchema = z.strictObject({
  action: z.enum(["translate", "accept"]).default("translate"),
  translator: z.string().trim().max(MAX_TRANSLATOR_NAME).optional(),
});

const STATUS_OF: Record<TranslationError["code"], number> = {
  "nothing-to-translate": 400,
  "already-hebrew": 409,
  "page-mismatch": 502,
  "not-hebrew": 400,
  "translator-required": 400,
  "changed-meanwhile": 409,
  "license-forbids": 409,
  provider: 502,
};

/** Books being translated right now, so a double click does not pay for two translations. */
const running = new Set<string>();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const body = BodySchema.parse(await readJson(request));
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);

    if (body.action === "accept") {
      const accepted = await acceptManualTranslation({ repo: ctx.repo }, book.id, { translator: body.translator });
      return jsonOk({ status: "accepted", isMock: false, book: accepted });
    }

    if (running.has(book.id)) return jsonError(409, "הספר הזה כבר בתרגום. חכו שהתרגום יסתיים.");
    // A paid model call: limited per user (RATE_LIMIT_TRANSLATE_PER_HOUR, in-process).
    const limited = rateLimited("TRANSLATE", { request, user: ctx.user });
    if (limited) return limited;
    running.add(book.id);
    try {
      const result = await translateBook(
        { repo: ctx.repo, media: ctx.media, text: await getTextProvider() },
        book.id,
        { translator: body.translator },
      );
      return jsonOk(result);
    } finally {
      running.delete(book.id);
    }
  } catch (err) {
    if (err instanceof TranslationError) {
      if (err.detail) console.error(`[translation] ${err.code}: ${err.detail}`);
      return jsonError(STATUS_OF[err.code], err.message, { code: err.code, pageIndexes: err.pageIndexes });
    }
    return studioApiError(err);
  }
}
