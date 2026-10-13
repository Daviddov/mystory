/**
 * Local (development) auth: no passwords. A visitor types a name and an
 * optional email and gets an HMAC-signed httpOnly session cookie.
 * Emails listed in ADMIN_EMAILS get the admin role.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { adminEmails, dataDir } from "../config";
import { getRepo } from "../repo";
import type { User } from "../types";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from "./session";
import type { AuthProvider } from "./types";

interface SecretGlobal {
  __mystoryAuthSecret?: Promise<string>;
}
const globalRef = globalThis as unknown as SecretGlobal;

async function loadSecret(): Promise<string> {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  // No AUTH_SECRET: use a random secret persisted in the data folder so that
  // sessions survive a dev-server restart. Never do this in production.
  const file = path.join(dataDir(), ".auth-secret");
  let secret: string | undefined;
  try {
    secret = (await fs.readFile(file, "utf8")).trim() || undefined;
  } catch {
    secret = undefined;
  }
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, secret, { mode: 0o600 });
    } catch {
      // Read-only filesystem: the secret lives only as long as this process.
    }
  }
  console.warn(
    "[auth] AUTH_SECRET is not set. Using a random development secret (data/.auth-secret). " +
      "Set AUTH_SECRET before deploying.",
  );
  return secret;
}

export function getAuthSecret(): Promise<string> {
  globalRef.__mystoryAuthSecret ??= loadSecret();
  return globalRef.__mystoryAuthSecret;
}

/** The development login is refused in production builds unless ALLOW_DEV_LOGIN=1. */
export function isLocalLoginAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_LOGIN === "1";
}

function withAdminGrant(user: User): User {
  if (user.email && adminEmails().includes(user.email.toLowerCase())) return { ...user, role: "admin" };
  return user;
}

/**
 * Creates or reuses a user and sets the session cookie.
 * Only callable from a Server Action or Route Handler.
 */
export async function signInLocal(name: string, email?: string): Promise<User> {
  if (!isLocalLoginAllowed()) {
    throw new Error("ההתחברות לסביבת הפיתוח כבויה בסביבת הייצור");
  }
  const repo = await getRepo();
  const cleanEmail = email?.trim().toLowerCase() || undefined;
  const isAdmin = cleanEmail !== undefined && adminEmails().includes(cleanEmail);
  const user = await repo.upsertUser({
    name: name.trim(),
    email: cleanEmail,
    ...(isAdmin ? { role: "admin" as const } : {}),
  });
  const token = createSessionToken(user.id, await getAuthSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return user;
}

export function createLocalAuth(): AuthProvider {
  return {
    kind: "local",
    async getCurrentUser() {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!token) return null;
      const payload = verifySessionToken(token, await getAuthSecret());
      if (!payload) return null;
      const user = await (await getRepo()).getUser(payload.uid);
      return user ? withAdminGrant(user) : null;
    },
    async signOut() {
      (await cookies()).delete(SESSION_COOKIE);
    },
  };
}
