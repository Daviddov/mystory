/**
 * A small in-process rate limiter for the endpoints that cost money or CPU
 * (narration, nikud, OCR, translation, PDF) and for the anonymous view counter.
 *
 * IMPORTANT: the counters live in the memory of ONE server process. They reset
 * on restart, and with several instances (serverless, more than one container)
 * each instance counts separately, so the effective limit is multiplied by the
 * number of instances. This slows down a loop; it is not a billing guarantee.
 * A multi-instance deployment needs a shared store (Redis, a database table)
 * or limits at the vendor / gateway.
 *
 * No "server-only" import, so it can be unit tested.
 */

export interface RateLimitRule {
  /** Requests allowed per window. 0 blocks everything; Infinity disables the limit. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the next request would be allowed (0 when ok). */
  retryAfterSeconds: number;
}

const HOUR_MS = 60 * 60 * 1000;
/** Hard cap on tracked keys, so the limiter itself cannot be used to exhaust memory. */
const MAX_KEYS = 20_000;

interface LimiterGlobal {
  __mystoryRateLimits?: Map<string, number[]>;
}
const globalRef = globalThis as unknown as LimiterGlobal;

function buckets(): Map<string, number[]> {
  return (globalRef.__mystoryRateLimits ??= new Map());
}

/** Forgets every counter. For tests. */
export function resetRateLimits(): void {
  buckets().clear();
}

function prune(store: Map<string, number[]>, now: number): void {
  for (const [key, hits] of store) {
    // The longest window in use is a day; anything older can never matter.
    if (hits.length === 0 || now - hits[hits.length - 1] > 24 * HOUR_MS) store.delete(key);
  }
  if (store.size >= MAX_KEYS) {
    // Still full of live keys: drop the oldest entries (insertion order).
    let excess = store.size - MAX_KEYS / 2;
    for (const key of store.keys()) {
      if (excess-- <= 0) break;
      store.delete(key);
    }
  }
}

/**
 * Sliding-window check. Counts this request when it is allowed; a refused
 * request is not counted (so waiting really helps).
 */
export function checkRateLimit(scope: string, key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitResult {
  if (!Number.isFinite(rule.limit)) return { ok: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
  const store = buckets();
  const id = `${scope}|${key}`;
  const hits = (store.get(id) ?? []).filter((at) => now - at < rule.windowMs);

  if (hits.length >= rule.limit) {
    store.set(id, hits);
    const oldest = hits[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  if (!store.has(id) && store.size >= MAX_KEYS) prune(store, now);
  hits.push(now);
  store.set(id, hits);
  return { ok: true, remaining: rule.limit - hits.length, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// The limits of this site
// ---------------------------------------------------------------------------

/**
 * Requests per hour, per signed-in user (per IP for anonymous callers).
 * Override each with the environment variable RATE_LIMIT_<NAME>_PER_HOUR
 * (a whole number; 0 blocks the endpoint, "off" removes the limit).
 */
export const RATE_LIMIT_DEFAULTS = {
  /** POST /api/narration/<bookId>: one run narrates up to a whole book. */
  NARRATION: 30,
  /** POST /api/narration/sample: one short sample sentence in the chosen voice (a little TTS quota). */
  SAMPLE: 20,
  /** POST /api/narration/nikud: one call per page ("nikud for all pages" sends one per page). */
  NIKUD: 400,
  /** POST /api/import/ocr: one call per imported page. */
  OCR: 150,
  /** POST /api/studio/books/<id>/translate and other translation calls. */
  TRANSLATE: 60,
  /** POST /api/studio/books/<id>/illustrate: one hero image or one page illustration. */
  ILLUSTRATE: 60,
  /** POST /api/studio/books/<id>/write: one whole story (several model calls). */
  WRITE: 20,
  /** POST /api/studio/books/<id>/details: one model call that suggests the book details. */
  DETAILS: 60,
  /** POST /api/studio/books/<id>/animate (AI): one clip, a few cents per second of video. */
  ANIMATE: 20,
  /** GET /api/pdf/<slug>. */
  PDF: 60,
  /** POST /api/comments/<bookId>: one comment on a book. */
  COMMENTS: 30,
  /** POST /api/views/<bookId>, per IP. */
  VIEWS: 120,
  /** POST /api/waitlist, per IP. */
  WAITLIST: 10,
} as const;
export type RateLimitName = keyof typeof RATE_LIMIT_DEFAULTS;

export function rateLimitRule(name: RateLimitName, env: Record<string, string | undefined> = process.env): RateLimitRule {
  const raw = env[`RATE_LIMIT_${name}_PER_HOUR`]?.trim().toLowerCase();
  if (raw === "off" || raw === "unlimited") return { limit: Number.POSITIVE_INFINITY, windowMs: HOUR_MS };
  const parsed = raw ? Number(raw) : Number.NaN;
  const limit = Number.isInteger(parsed) && parsed >= 0 ? parsed : RATE_LIMIT_DEFAULTS[name];
  return { limit, windowMs: HOUR_MS };
}

/**
 * The caller's address as reported by the reverse proxy. Without a trusted
 * proxy in front of the server this header can be forged, so IP limits are a
 * speed bump for anonymous routes, not an identity.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F.:]{3,45}$/.test(candidate) ? candidate.toLowerCase() : "unknown";
}

export interface RateLimitCaller {
  /** The signed-in user, when there is one. Editors and admins are not limited. */
  user?: { id: string; role: string } | null;
  request: Request;
}

/** The counter key of a caller: the user id when signed in, otherwise the IP address. */
export function rateLimitKey(caller: RateLimitCaller): string {
  return caller.user ? `u:${caller.user.id}` : `ip:${clientIp(caller.request)}`;
}

function tooManyRequests(result: RateLimitResult): Response {
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  return Response.json(
    { error: `יותר מדי בקשות בזמן קצר. נסו שוב בעוד ${minutes === 1 ? "דקה" : `${minutes} דקות`}.` },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}

/**
 * Counts one request against the caller's limit. Returns a 429 response when
 * the limit is used up, otherwise null (go on). Staff are exempt.
 */
export function rateLimited(name: RateLimitName, caller: RateLimitCaller): Response | null {
  if (caller.user && (caller.user.role === "admin" || caller.user.role === "editor")) return null;
  const result = checkRateLimit(name, rateLimitKey(caller), rateLimitRule(name));
  return result.ok ? null : tooManyRequests(result);
}
