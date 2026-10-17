/**
 * Animation of one book's illustrations ("bring illustrations to life").
 *
 * GET    /api/admin/books/<id>/animate[?force=1]
 *        -> BookAnimationSummary of a DRY RUN: which pages would be animated and
 *           the estimated cost. Calls no provider. Editors and admins.
 *
 * POST   /api/admin/books/<id>/animate     body (optional JSON):
 *        { force?: boolean, pages?: number[] (zero-based) }
 *        -> 200 application/x-ndjson, one AnimationEvent per line (see
 *           @/lib/animation/types): start, page (one per page), then done or error.
 *        Admins only: it spends money (a few cents per second of video).
 *        A book whose license forbids derivative works answers 403.
 *        One run per book at a time (409 otherwise).
 *
 * DELETE /api/admin/books/<id>/animate     body (optional JSON): { pages?: number[] }
 *        -> { bookId, removed: number[] }. Editors and admins.
 *
 * All methods are same-origin only (requireAdminApi). Errors before the stream
 * starts are JSON: { error }.
 */
import { z } from "zod";
import { requireAdminApi } from "@/app/admin/_lib/guard";
import { apiError, jsonError, jsonOk } from "@/lib/api";
import {
  animateBook,
  animationLicenseCheck,
  getAnimationDeps,
  removeBookAnimation,
  videoCostPerSecondUsd,
  type AnimationDeps,
  type AnimationEvent,
} from "@/lib/animation";
import { animateBookWith } from "@/lib/animation/pipeline";
import { NotFoundError } from "@/lib/repo/types";
import { IdSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
// One clip takes one to two minutes with Veo. A run that is cut off can simply
// be started again: pages that already have a current clip are skipped.
// 300 is the most Vercel's Hobby plan allows; a higher value fails the build.
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

const PagesSchema = z.array(z.number().int().min(0).max(999)).max(200);
const PostBodySchema = z.strictObject({ force: z.boolean().optional(), pages: PagesSchema.optional() });
const DeleteBodySchema = z.strictObject({ pages: PagesSchema.optional() });

/** Books with a run in progress, in this process. */
interface RunningGlobal {
  __mystoryAnimationRuns?: Set<string>;
}
const running = ((globalThis as unknown as RunningGlobal).__mystoryAnimationRuns ??= new Set<string>());

async function readOptionalJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // the schema rejects it -> 400
  }
}

export async function GET(request: Request, { params }: Context): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    const force = new URL(request.url).searchParams.get("force") === "1";
    return jsonOk(await animateBook(id, { dryRun: true, force }));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  let bookId: string;
  let options: z.infer<typeof PostBodySchema>;
  let deps: AnimationDeps;
  let total: number;
  try {
    await requireAdminApi(request, "admin");
    bookId = IdSchema.parse((await params).id);
    options = PostBodySchema.parse(await readOptionalJson(request));
    try {
      deps = await getAnimationDeps();
    } catch (err) {
      // A provider is configured but unusable (missing key, unknown vendor...).
      console.error("[animation] provider unavailable", err);
      return jsonError(503, "שירות הווידאו אינו מוגדר כראוי. בדקו את ההגדרות של VIDEO_PROVIDER.");
    }
    const book = await deps.repo.getBookById(bookId);
    if (!book) throw new NotFoundError(`book ${bookId}`);
    const license = animationLicenseCheck(book);
    if (!license.allowed) return jsonError(403, license.message);
    const wanted = options.pages;
    total = wanted ? book.pages.filter((page) => wanted.includes(page.index)).length : book.pages.length;
  } catch (err) {
    return apiError(err);
  }
  if (running.has(bookId)) return jsonError(409, "הנפשת האיורים של הספר הזה כבר רצה. חכו שתסתיים.");
  running.add(bookId);

  const encoder = new TextEncoder();
  // Stop between pages when the admin leaves, but let a clip that is already
  // being made (and paid for) finish and be stored.
  const stop = new AbortController();
  const costPerSecondUsd = videoCostPerSecondUsd();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AnimationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the client went away
        }
      };
      send({ type: "start", bookId, total, provider: deps.video.name, providerMock: deps.video.isMock });
      try {
        const summary = await animateBookWith(deps, bookId, {
          ...options,
          costPerSecondUsd,
          signal: stop.signal,
          onPage: (result, done, count) => {
            send({ type: "page", done, total: count, result });
            if (request.signal.aborted) stop.abort();
          },
        });
        send({ type: "done", summary });
      } catch (err) {
        console.error("[animation] run failed", err);
        send({ type: "error", error: "הנפשת האיורים נכשלה. נסו שוב בעוד רגע." });
      } finally {
        running.delete(bookId);
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

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const id = IdSchema.parse((await params).id);
    const { pages } = DeleteBodySchema.parse(await readOptionalJson(request));
    if (running.has(id)) return jsonError(409, "הנפשת האיורים של הספר הזה רצה עכשיו. חכו שתסתיים.");
    return jsonOk(await removeBookAnimation(id, pages ? { pages } : {}));
  } catch (err) {
    return apiError(err);
  }
}
