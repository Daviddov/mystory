/**
 * POST /api/narration/nikud      body: { text: string }  (up to 8000 characters)
 *   -> { text, isMock, provider }
 *
 * Adds nikud to arbitrary text for the book editor. Any signed-in user may
 * call it. When `isMock` is true no nikud service is configured and `text` is
 * the input unchanged: show <MockNotice kind="nikud" /> instead of pretending.
 * Nothing is stored.
 *
 * Same-origin only and rate limited per user (RATE_LIMIT_NIKUD_PER_HOUR,
 * in-process: see @/lib/rate-limit).
 */
import { z } from "zod";
import { apiError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { vocalize, type VocalizeResult } from "@/lib/narration";
import { rateLimited } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

const BodySchema = z.strictObject({
  text: z.string().max(8000),
});

export async function POST(request: Request): Promise<Response> {
  let text: string;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const limited = rateLimited("NIKUD", { request, user });
    if (limited) return limited;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return jsonError(400, "הבקשה אינה JSON תקין");
    }
    text = BodySchema.parse(json).text;
  } catch (err) {
    return apiError(err);
  }

  let result: VocalizeResult;
  try {
    result = await vocalize(text);
  } catch (err) {
    console.error("[narration] nikud failed", err);
    return jsonError(502, "שירות הניקוד לא זמין כרגע. נסו שוב בעוד רגע.");
  }
  return Response.json(result);
}
