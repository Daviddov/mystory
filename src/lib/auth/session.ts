/** HMAC-signed session tokens for the local auth mode. Pure functions (Node crypto). */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mystory_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SessionPayload {
  /** User id. */
  uid: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSessionToken(
  uid: string,
  secret: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
  now: number = Date.now(),
): string {
  const payload: SessionPayload = { uid, exp: Math.floor(now / 1000) + maxAgeSeconds };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload when the signature is valid and the token has not expired, otherwise null. */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= now) return null;
    return { uid: payload.uid, exp: payload.exp };
  } catch {
    return null;
  }
}
