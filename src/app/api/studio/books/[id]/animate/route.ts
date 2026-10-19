/**
 * The "animate" stage of the studio, for the book's owner (editors and admins too).
 *
 * POST multipart/form-data { page: zero-based index, file: mp4 or webm clip }
 *      MANUAL: stores the clip you made yourself and attaches it to the page.
 * POST application/json   { page, motion?, notes? (<= 400), replace? }
 *      AI: animates ONE page's illustration with the configured video service
 *      (a few cents per second of video; rate limited per user). A page that
 *      already has a clip (AI, demo or your own upload) is refused with 409
 *      unless replace is true, which is the explicit consent to replace it.
 *      motion / notes default to the book's hero.animationMotion / animationNotes.
 *      -> PageAnimationResult & { replacedUserClip: boolean }
 * DELETE application/json { page: zero-based index }  -> { removed: number[] }
 *
 * Needs the page to have an illustration. A book whose license forbids
 * derivative works is refused. Locked books (published / waiting for review)
 * are refused for owners, like every other edit.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { animationLicenseCheck, getAnimationDeps, videoCostPerSecondUsd } from "@/lib/animation";
import { animateBookWith, imageHash, removeBookAnimationWith } from "@/lib/animation/pipeline";
import { withBookLock } from "@/lib/book-lock";
import { cleanFreeText } from "@/lib/generation/input";
import { ANIMATION_NOTES_MAX } from "@/lib/generation/presets";
import { bookMediaPath } from "@/lib/media/url";
import { rateLimited } from "@/lib/rate-limit";
import { readJson, studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook, StudioError } from "@/lib/studio/service";

export const dynamic = "force-dynamic";
/** One clip takes one to two minutes with Veo. */
export const maxDuration = 300;

const CLIP_MAX_BYTES = 25 * 1024 * 1024;
const PageSchema = z.strictObject({ page: z.number().int().min(0).max(999) });
const AiSchema = z.strictObject({
  page: z.number().int().min(0).max(999),
  motion: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  notes: z.string().max(ANIMATION_NOTES_MAX * 4).transform(cleanFreeText).pipe(z.string().max(ANIMATION_NOTES_MAX)).optional(),
  /** Explicit consent to replace the page's existing clip, including one the user uploaded. */
  replace: z.boolean().optional(),
});

/** Requests running right now ("<bookId>:<page>"), so a double click does not pay twice. */
const running = new Set<string>();

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < Math.min(bytes.length, start + length); i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/** The clip type from its first bytes (never from the declared type or the name), or null. */
function sniffClip(bytes: Uint8Array): { contentType: string; ext: string } | null {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 4, 4) === "ftyp") return { contentType: "video/mp4", ext: "mp4" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { contentType: "video/webm", ext: "webm" };
  }
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);
    const license = animationLicenseCheck(book);
    if (!license.allowed) return jsonError(403, license.message);

    const manual = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
    if (manual) {
      const limited = rateLimited("ANIMATE", { request, user: ctx.user });
      if (limited) return limited;
    }
    let pageIndex: number;
    let ai: z.infer<typeof AiSchema> | null = null;
    let clip: Uint8Array | null = null;
    if (manual) {
      const declared = Number(request.headers.get("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > CLIP_MAX_BYTES + 64 * 1024) throw new StudioError(413, "הקליפ גדול מדי");
      const form = await request.formData();
      pageIndex = PageSchema.parse({ page: Number(form.get("page")) }).page;
      const file = form.get("file");
      if (!(file instanceof Blob)) throw new StudioError(400, "לא צורף קובץ");
      if (file.size === 0) throw new StudioError(400, "הקובץ ריק");
      if (file.size > CLIP_MAX_BYTES) throw new StudioError(413, "הקליפ גדול מדי. הגודל המרבי הוא 25 מ\"ב.");
      clip = new Uint8Array(await file.arrayBuffer());
    } else {
      ai = AiSchema.parse(await readJson(request));
      pageIndex = ai.page;
    }

    const page = book.pages[pageIndex];
    if (!page) throw new StudioError(400, "העמוד לא נמצא. שמרו את הספר ונסו שוב.");
    if (!page.image) throw new StudioError(409, "אין איור בעמוד הזה. הוסיפו איור ואז אפשר להנפיש אותו.");

    if (clip) {
      const kind = sniffClip(clip);
      if (!kind) throw new StudioError(415, "סוג הקובץ לא נתמך. אפשר להעלות קליפ MP4 או WebM.");
      const image = await ctx.media.get(page.image);
      if (!image) throw new StudioError(409, "קובץ האיור של העמוד לא נמצא.");
      const hash = imageHash(image.bytes);
      const name = `animation-${String(pageIndex + 1).padStart(2, "0")}-${createHash("sha256").update(clip).digest("hex").slice(0, 10)}.${kind.ext}`;
      const videoPath = bookMediaPath(book.id, name);
      await ctx.media.put(videoPath, clip, kind.contentType);
      await withBookLock(book.id, async () => {
        const fresh = await ctx.repo.getBookById(book.id);
        const current = fresh?.pages[pageIndex];
        if (!fresh || !current || current.image !== page.image) {
          if (!fresh?.pages.some((p) => p.video === videoPath)) await ctx.media.delete(videoPath).catch(() => undefined);
          throw new StudioError(409, "האיור השתנה בזמן ההעלאה. נסו שוב.");
        }
        // A clip you made yourself carries no videoSource: it is neither the AI's nor a demo.
        const pages = fresh.pages.map((p) =>
          p.index === pageIndex ? { ...p, video: videoPath, videoImageHash: hash, videoSource: undefined } : p,
        );
        const saved = await ctx.repo.replacePages(book.id, pages);
        const old = current.video;
        if (old && old !== videoPath && !saved.pages.some((p) => p.video === old)) {
          await ctx.media.delete(old).catch(() => undefined);
        }
      });
      return jsonOk({ status: "attached", pageIndex, video: videoPath }, { status: 201 });
    }

    const replacing = !!page.video;
    const replacesUserClip = replacing && !page.videoSource; // no source: a clip the user uploaded
    if (replacing && !ai?.replace) {
      throw new StudioError(
        409,
        replacesUserClip
          ? "בעמוד הזה יש קליפ שהעליתם בעצמכם. אשרו כדי להחליף אותו בהנפשה חדשה."
          : "בעמוד הזה כבר יש הנפשה. בחרו \"הנפשה מחדש\" כדי ליצור חדשה.",
      );
    }
    const key = `${book.id}:${pageIndex}`;
    if (running.has(key)) return jsonError(409, "העמוד הזה כבר בהנפשה. חכו שתסתיים.");
    const limited = rateLimited("ANIMATE", { request, user: ctx.user });
    if (limited) return limited;
    running.add(key);
    try {
      let deps;
      try {
        deps = await getAnimationDeps();
      } catch {
        return jsonError(503, "שירות הווידאו אינו מוגדר כראוי. אפשר להעלות קליפ ידנית.");
      }
      const motion = ai?.motion ?? book.hero?.animationMotion;
      const notes = ai?.notes ?? book.hero?.animationNotes;
      const summary = await animateBookWith(deps, book.id, {
        pages: [pageIndex],
        force: !!ai?.replace,
        ...(motion ? { motion } : {}),
        ...(notes ? { notes } : {}),
        costPerSecondUsd: videoCostPerSecondUsd(),
      });
      const result = summary.results[0] ?? { status: "failed", pageIndex, error: "ההנפשה לא הופעלה" };
      return jsonOk({ ...result, replacedUserClip: replacesUserClip && result.status === "animated" });
    } finally {
      running.delete(key);
    }
  } catch (err) {
    return studioApiError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await studioContext(request, { mutating: true });
    const book = await loadEditableBook(ctx, id);
    assertBookWritable(book, ctx.user);
    const { page } = PageSchema.parse(await readJson(request));
    return jsonOk(await removeBookAnimationWith({ repo: ctx.repo, media: ctx.media }, book.id, { pages: [page] }));
  } catch (err) {
    return studioApiError(err);
  }
}
