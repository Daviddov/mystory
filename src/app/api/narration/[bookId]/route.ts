/**
 * Narration of one book.
 *
 * GET  /api/narration/<bookId>
 *      -> { bookId, ttsProvider, nikudProvider, ttsMock, nikudMock, pages: PageNarrationState[] }
 *
 * POST /api/narration/<bookId>      body (optional JSON):
 *      { force?: boolean, pages?: number[] (zero-based), voice?: string, speed?: number,
 *        style?: string (narration style slug), notes?: string (<= 300), overwriteRecorded?: boolean }
 *      -> 200 application/x-ndjson, one NarrationEvent per line (see @/lib/narration/types):
 *         start, page (one per page), then done or error.
 *
 * Both require a signed-in user who may edit the book (its owner, an editor
 * or an admin); a book that exists but belongs to someone else answers 404,
 * exactly as in the studio, so ids cannot be probed. Errors before the stream
 * starts are JSON: { error }.
 *
 * POST costs money (text to speech), so it is same-origin only, rate limited
 * per user (RATE_LIMIT_NARRATION_PER_HOUR, in-process: see @/lib/rate-limit)
 * and `voice` must be one of the active provider's voices (the Gemini catalog, TTS_VOICE, TTS_ALLOWED_VOICES).
 */
import { z } from "zod";
import { getAiStatus, ttsHonoursNotes } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { getNarrationDeps, pageState, type NarrationEvent } from "@/lib/narration";
import { availableNarrationVoices, fallbackNarrationVoice, isAllowedNarrationVoice } from "@/lib/narration/voices";
import { narrateBookWith, type NarrationDeps } from "@/lib/narration/pipeline";
import { cleanFreeText } from "@/lib/generation/input";
import { rateLimited } from "@/lib/rate-limit";
import { studioApiError, studioContext } from "@/lib/studio/http";
import { assertBookWritable, loadEditableBook as loadStudioBook, type StudioContext } from "@/lib/studio/service";
import type { BookWithPages } from "@/lib/types";

export const dynamic = "force-dynamic";
// Narrating a long book with a real TTS vendor takes minutes.
export const maxDuration = 300;

const BodySchema = z.strictObject({
  force: z.boolean().optional(),
  pages: z.array(z.number().int().min(0).max(999)).max(200).optional(),
  voice: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  speed: z.number().min(0.5).max(2).optional(),
  /** Narration style preset slug; falls back to the book's hero.narrationStyle. */
  style: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  /** Free-text wishes, cleaned. Providers that cannot use free text ignore them (see styleNotesIgnored). */
  notes: z.string().max(1200).transform(cleanFreeText).pipe(z.string().max(300)).optional(),
  overwriteRecorded: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ bookId: string }>;
}

/**
 * Loads the book through the studio's own access check (one implementation for
 * every route): a missing book and someone else's book both answer 404. With
 * `forWrite`, a published or pending book is locked for its owner, as in the studio.
 */
async function loadEditableBook(
  request: Request,
  context: RouteParams,
  forWrite = false,
): Promise<{ book: BookWithPages; ctx: StudioContext }> {
  const ctx = await studioContext(request, { mutating: forWrite });
  const book = await loadStudioBook(ctx, (await context.params).bookId);
  if (forWrite) assertBookWritable(book, ctx.user);
  return { book, ctx };
}

export async function GET(request: Request, context: RouteParams): Promise<Response> {
  try {
    const { book } = await loadEditableBook(request, context);
    const status = getAiStatus();
    return Response.json({
      bookId: book.id,
      voices: availableNarrationVoices(),
      defaultVoice: fallbackNarrationVoice() ?? null,
      notesHonoured: ttsHonoursNotes(),
      ttsProvider: status.tts.name,
      nikudProvider: status.nikud.name,
      ttsMock: status.tts.isMock,
      nikudMock: status.nikud.isMock,
      pages: book.pages.map(pageState),
    });
  } catch (err) {
    return studioApiError(err);
  }
}

export async function POST(request: Request, context: RouteParams): Promise<Response> {
  let book: BookWithPages;
  let options: z.infer<typeof BodySchema>;
  let deps: NarrationDeps;
  try {
    const loaded = await loadEditableBook(request, context, true);
    book = loaded.book;
    const limited = rateLimited("NARRATION", { request, user: loaded.ctx.user });
    if (limited) return limited;
    const raw = await request.text();
    let json: unknown = {};
    if (raw.trim() !== "") {
      try {
        json = JSON.parse(raw);
      } catch {
        return jsonError(400, "הבקשה אינה JSON תקין");
      }
    }
    options = BodySchema.parse(json);
    if (options.voice && !isAllowedNarrationVoice(options.voice)) {
      return jsonError(400, "הקול שנבחר אינו זמין באתר הזה.");
    }
  } catch (err) {
    return studioApiError(err);
  }
  try {
    deps = await getNarrationDeps();
  } catch (err) {
    // A provider is configured but unusable (missing key, unknown vendor...).
    console.error("[narration] providers unavailable", err);
    return jsonError(503, "שירות ההקראה אינו מוגדר כראוי. פנו למנהל האתר.");
  }

  const encoder = new TextEncoder();
  // Always pass an explicit voice: the request's, else the book's if still offered, else the default.
  const heroVoice = book.hero?.narrationVoice;
  const voice =
    options.voice ?? (heroVoice && isAllowedNarrationVoice(heroVoice) ? heroVoice : fallbackNarrationVoice());
  const wanted = options.pages;
  const total = wanted ? book.pages.filter((page) => wanted.includes(page.index)).length : book.pages.length;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: NarrationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the client went away
        }
      };
      send({
        type: "start",
        bookId: book.id,
        total,
        ttsProvider: deps.tts.name,
        nikudProvider: deps.nikud.name,
        ttsMock: deps.tts.isMock,
        nikudMock: deps.nikud.isMock,
        // ElevenLabs cannot follow free text; say so instead of pretending (Gemini uses the notes).
        ...((options.notes || book.hero?.narrationNotes) && !ttsHonoursNotes()
          ? { styleNotesIgnored: true }
          : {}),
      });
      try {
        const summary = await narrateBookWith(deps, book.id, {
          ...options,
          ...(voice ? { voice } : {}),
          signal: request.signal,
          onPage: (result, done, count) => send({ type: "page", done, total: count, result }),
        });
        send({ type: "done", summary });
      } catch (err) {
        console.error("[narration] run failed", err);
        send({ type: "error", error: "ההקראה נכשלה. נסו שוב בעוד רגע." });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
