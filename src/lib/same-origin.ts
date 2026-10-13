/**
 * The one same-origin check for mutating routes. The session cookie is
 * SameSite=Lax already; this is a second, explicit line of defence against
 * cross-site requests. Every route family (studio, import, personal, admin,
 * generation, narration, views) uses this function, so a fix lands everywhere.
 *
 * Rules:
 *  - No Origin header: allowed, unless the browser says the request is
 *    cross-site (`Sec-Fetch-Site: cross-site`). Same-origin GETs and non-browser
 *    clients (curl, the cron scheduler) send no Origin.
 *  - `Origin: null` (sandboxed frame, opaque origin): refused.
 *  - Otherwise the Origin host must equal one of the hosts the request was
 *    addressed to: Host, any entry of X-Forwarded-Host, or the URL host.
 *    Hosts are compared case-insensitively.
 */
import { AuthError } from "./auth/types";

export const CROSS_ORIGIN_MESSAGE = "הבקשה נחסמה";

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site")?.toLowerCase() !== "cross-site";
  if (origin.trim().toLowerCase() === "null") return false;
  const originHost = hostOf(origin);
  if (!originHost) return false;

  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")]
    .filter((value): value is string => !!value)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  const urlHost = hostOf(request.url);
  if (urlHost) hosts.push(urlHost);
  return hosts.includes(originHost);
}

/** Throws AuthError(403) for a cross-site request (apiError() turns it into a JSON 403). */
export function assertSameOrigin(request: Request): void {
  if (!isSameOriginRequest(request)) throw new AuthError(403, CROSS_ORIGIN_MESSAGE);
}
