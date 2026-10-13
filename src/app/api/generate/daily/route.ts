/**
 * POST /api/generate/daily   create today's daily story as a 'pending' book.
 *
 * For a scheduler: send `Authorization: Bearer <CRON_SECRET>`. Without
 * CRON_SECRET configured, only a signed-in admin may call it. An admin may add
 * `?force=1` to generate a second story for the same day.
 *
 * Responses: 202 { jobId } started | 200 { jobId, skipped: true } already done today | 401 | 403.
 * The same job can be run from a terminal with scripts/daily-story.ts.
 */
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { apiError, jsonOk } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { cronSecret } from "@/lib/config";
import { startDailyJob } from "@/lib/generation/server";
import { assertSameOrigin } from "@/lib/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hasCronSecret(request: Request): boolean {
  const secret = cronSecret();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<Response> {
  try {
    let force = false;
    if (!hasCronSecret(request)) {
      // An admin's browser session: cross-site posts are refused like everywhere else.
      assertSameOrigin(request);
      await requireRole("admin");
      force = new URL(request.url).searchParams.get("force") === "1";
    }
    const started = await startDailyJob({ force });
    if (started.skipped) return jsonOk({ jobId: started.job.id, skipped: true });
    after(started.run);
    return jsonOk({ jobId: started.job.id }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
