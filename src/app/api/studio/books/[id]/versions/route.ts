/**
 * POST /api/studio/books/<id>/versions   "Add a language" to a book.
 *
 *   { action: "translate", language, translator? }
 *       Translates the whole book into `language` (one AI call) and stores it as a
 *       version next to the book's own text. -> { status: "translated" | "mock", book }
 *   { action: "save", language, title, summary?, pages: string[], translator? }
 *       Stores texts a person typed.
 *   { action: "remove", language }
 *       Removes the version and its narration.
 *
 * Owner, editor or admin; refused for a published book unless the caller is an editor.
 * The narration of a version is made page by page in ./[language]/narrate.
 */
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { getTextProvider } from "@/lib/ai";
import { rateLimited } from "@/lib/rate-limit";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook } from "@/lib/studio/service";
import { MAX_TRANSLATOR_NAME, TranslationError } from "@/lib/translation";
import { removeVersion, saveVersionText, translateToLanguage } from "@/lib/translation/versions";
import { BookLanguageSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Translator = z.string().trim().max(MAX_TRANSLATOR_NAME).optional();
const BodySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("translate"), language: BookLanguageSchema, translator: Translator }),
  z.strictObject({
    action: z.literal("save"),
    language: BookLanguageSchema,
    title: z.string().trim().min(1).max(200),
    summary: z.string().max(2000).optional(),
    pages: z.array(z.string().max(5000)).max(200),
    translator: Translator,
  }),
  z.strictObject({ action: z.literal("remove"), language: BookLanguageSchema }),
]);

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

const running = new Set<string>();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const body = BodySchema.parse(await readJson(request));
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);
    const deps = { repo: ctx.repo, media: ctx.media };

    if (body.action === "remove") {
      return jsonOk({ status: "removed", book: await removeVersion(deps, book.id, body.language) });
    }
    if (body.action === "save") {
      const saved = await saveVersionText(deps, book.id, body.language, body);
      return jsonOk({ status: "saved", isMock: false, book: saved });
    }

    if (running.has(book.id)) return jsonError(409, "הספר הזה כבר בתרגום. חכו שהתרגום יסתיים.");
    const limited = await rateLimited("TRANSLATE", { request, user: ctx.user });
    if (limited) return limited;
    running.add(book.id);
    try {
      return jsonOk(await translateToLanguage({ ...deps, text: await getTextProvider() }, book.id, body.language, { translator: body.translator }));
    } finally {
      running.delete(book.id);
    }
  } catch (err) {
    if (err instanceof TranslationError) {
      if (err.detail) console.error(`[versions] ${err.code}: ${err.detail}`);
      return jsonError(STATUS_OF[err.code], err.message, { code: err.code, pageIndexes: err.pageIndexes });
    }
    return studioApiError(err);
  }
}
