/**
 * POST /api/waitlist { email, interests: ("credits" | "personal-book" | "print")[] } -> { ok: true }
 * Public. Adds the e-mail to the waiting list. The answer is the same whether the
 * address was new or not, so the list cannot be probed for who has signed up.
 */
import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api";
import { getRepo } from "@/lib/repo";
import { rateLimited } from "@/lib/rate-limit";
import { WaitlistInterestSchema } from "@/lib/types";
import { NO_STORE, readJsonBody, rejectCrossOrigin } from "@/components/personal/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  interests: z.array(WaitlistInterestSchema).min(1).max(3),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;
    const limited = rateLimited("WAITLIST", { request });
    if (limited) return limited;
    const { email, interests } = BodySchema.parse(await readJsonBody(request));
    const repo = await getRepo();
    await repo.addWaitlistEntry(email, interests);
    return jsonOk({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
