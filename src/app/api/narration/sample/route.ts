/**
 * POST /api/narration/sample     body: { voice?: string, style?: string }
 *   -> 200 audio (audio/wav or the provider's format) of ONE short fixed Hebrew
 *      sentence in the chosen voice and style. Header X-Tts-Mock: 1 when no real
 *      voice is configured (the audio is silent).
 *
 * Lets an author hear a voice before narrating a book. Touches no book and stores
 * nothing, but it does use a little TTS quota, so it is same-origin only, needs a
 * signed-in user, is rate limited (RATE_LIMIT_SAMPLE_PER_HOUR, default 20) and
 * accepts only voices the active provider offers.
 */
import { z } from "zod";
import { synthesize } from "@/lib/ai";
import { apiError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fallbackNarrationVoice, isAllowedNarrationVoice } from "@/lib/narration/voices";
import { rateLimited } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The fixed sample, with nikud so every voice reads it the same way. */
export const SAMPLE_TEXT = "שָׁלוֹם יְלָדִים, הָיָה הָיָה סִפּוּר יָפֶה, וְהוּא מַתְחִיל עַכְשָׁיו.";

const BodySchema = z.strictObject({
  voice: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  style: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const limited = rateLimited("SAMPLE", { request, user });
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
    body = BodySchema.parse(json);
    if (body.voice && !isAllowedNarrationVoice(body.voice)) {
      return jsonError(400, "הקול שנבחר אינו זמין באתר הזה.");
    }
  } catch (err) {
    return apiError(err);
  }

  const voice = body.voice ?? fallbackNarrationVoice();
  try {
    const result = await synthesize(SAMPLE_TEXT, {
      ...(voice ? { voice } : {}),
      ...(body.style ? { style: body.style } : {}),
    });
    return new Response(Buffer.from(result.audio), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
        ...(result.isMock ? { "X-Tts-Mock": "1" } : {}),
      },
    });
  } catch (err) {
    console.error("[narration] sample failed", err);
    // Provider messages of the Gemini provider are Hebrew and safe to show (quota, key).
    const message = err instanceof Error && err.name === "GeminiTtsError" ? err.message : "הדגמת הקול נכשלה. נסו שוב בעוד רגע.";
    return jsonError(502, message);
  }
}
