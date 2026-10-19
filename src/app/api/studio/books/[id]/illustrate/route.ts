/**
 * POST /api/studio/books/<id>/illustrate
 *
 *   { target: "hero", description?: string, style?: string }
 *       Draws the hero's reference image. Without a description one is written
 *       from the saved story first.
 *       -> HeroImageResult { path, url, description, style, descriptionWritten, isMock }
 *
 *   { target: "page", page: number (zero-based), note?: string }
 *       Illustrates one saved page from the saved hero, the whole story and the
 *       page text. The client saves its changes first.
 *       -> PageIllustrationResult { path, url, scene, isMock }
 *
 *   { target: "grid", pages: number[] (1..16 distinct, zero-based), layout?: "3x3"|"4x4"|"auto", notes?: string }
 *       Illustrates several saved pages with ONE image call: a grid of panels is drawn and cropped
 *       into one picture per page. One grid counts as one ILLUSTRATE call. 3x3 holds 9 pages,
 *       4x4 holds 16; fewer pages get the smallest fitting grid (1x1, 2x2, 3x3, 4x4).
 *       -> { panels: {page, path, url}[], layout, warnings: string[], isMock }
 *       A panel that could not be cut is missing from `panels` and explained in `warnings`.
 *
 * Only media files are written; the editor puts the path in the book and saves.
 * `isMock: true` means a placeholder: show <MockNotice kind="image" />.
 * Owner, editor or admin; refused for a locked book like every other edit.
 */
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { getImageProvider, getTextProvider } from "@/lib/ai";
import { rateLimited } from "@/lib/rate-limit";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { illustrateGrid } from "@/lib/studio/grid";
import { createHeroImage, IllustrateError, illustratePage } from "@/lib/studio/illustrate";
import { assertBookWritable, loadEditableBook } from "@/lib/studio/service";
import { MAX_HERO_DESCRIPTION, MAX_ILLUSTRATION_NOTE } from "@/lib/studio/shared";

export const dynamic = "force-dynamic";
/** A scene plus an image can take a minute or two with some vendors. */
export const maxDuration = 180;

const BodySchema = z.discriminatedUnion("target", [
  z.strictObject({
    target: z.literal("hero"),
    description: z.string().trim().max(MAX_HERO_DESCRIPTION).optional(),
    style: z.string().trim().max(100).optional(),
  }),
  z.strictObject({
    target: z.literal("page"),
    page: z.number().int().min(0).max(999),
    note: z.string().trim().max(MAX_ILLUSTRATION_NOTE).optional(),
  }),
  z.strictObject({
    target: z.literal("grid"),
    pages: z.array(z.number().int().min(0).max(999)).min(1).max(16),
    layout: z.enum(["3x3", "4x4", "auto"]).optional(),
    notes: z.string().trim().max(600).optional(),
  }),
]);

/** Requests running right now, so a double click does not pay twice. */
const running = new Set<string>();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const body = BodySchema.parse(await readJson(request));
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);

    const key = `${book.id}:${body.target === "hero" ? "hero" : body.target === "grid" ? "grid" : body.page}`;
    if (running.has(key)) return jsonError(409, "האיור הזה כבר בהכנה. חכו שיסתיים.");
    // Paid model calls: limited per user (RATE_LIMIT_ILLUSTRATE_PER_HOUR, in-process).
    const limited = rateLimited("ILLUSTRATE", { request, user: ctx.user });
    if (limited) return limited;

    running.add(key);
    try {
      const deps = { media: ctx.media, text: await getTextProvider(), image: await getImageProvider() };
      if (body.target === "hero") {
        return jsonOk(await createHeroImage(deps, book, { description: body.description, style: body.style }));
      }
      if (body.target === "grid") {
        return jsonOk(await illustrateGrid(deps, book, { pages: body.pages, layout: body.layout, notes: body.notes }));
      }
      return jsonOk(await illustratePage(deps, book, { pageIndex: body.page, note: body.note }));
    } finally {
      running.delete(key);
    }
  } catch (err) {
    if (err instanceof IllustrateError) return jsonError(err.status, err.message);
    return studioApiError(err);
  }
}
