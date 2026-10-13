/**
 * Supabase Auth provider. Loaded lazily by getAuthProvider() only when the
 * Supabase env vars are set.
 *
 * The session lives in cookies managed by @supabase/ssr. Identity comes from
 * getClaims(), which verifies the access-token signature (never from the
 * unverified user object in the cookie). The domain User (name, role) is the
 * row in public.profiles; CONFIRMED emails in ADMIN_EMAILS are promoted to
 * admin. Keep "Confirm email" enabled in the Supabase project: with it off,
 * Supabase marks every new address as confirmed without checking it.
 *
 * src/proxy.ts refreshes expiring sessions before rendering, because Server
 * Components cannot write cookies.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { adminEmails, supabaseConfig } from "../config";
import { getRepo } from "../repo";
import type { User } from "../types";
import type { AuthProvider } from "./types";

/**
 * A Supabase client bound to the cookies of the current request (anon key, the
 * visitor's own session). Create a new one per request; never cache it.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called while rendering a Server Component, where cookies are
          // read-only. The proxy has already refreshed the session.
        }
      },
    },
  });
}

interface Claims {
  sub?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

function displayName(claims: Claims): string {
  const meta = claims.user_metadata ?? {};
  for (const candidate of [meta.full_name, meta.name, claims.email?.split("@")[0]]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 100);
  }
  return "הורה";
}

async function readClaims(supabase: SupabaseClient): Promise<Claims | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return data.claims as Claims;
  } catch (err) {
    // A visitor with a broken or unverifiable session is anonymous.
    console.warn("[auth] could not verify the Supabase session:", err);
    return null;
  }
}

/** The part of the auth server's user record that the admin promotion depends on. */
export interface AuthServerUser {
  id?: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

/**
 * True when the auth server's own record says this exact user confirmed this
 * exact address. `user_metadata.email_verified` is NOT used: users can write
 * their own metadata.
 */
export function isConfirmedOwnerOfEmail(authUser: AuthServerUser | null | undefined, sub: string, email: string): boolean {
  if (!authUser || authUser.id !== sub) return false;
  if ((authUser.email ?? "").trim().toLowerCase() !== email) return false;
  const confirmedAt = authUser.email_confirmed_at;
  return typeof confirmedAt === "string" && Number.isFinite(Date.parse(confirmedAt));
}

/** Asks the auth server (a network call; only made for a not-yet-admin ADMIN_EMAILS address). Never throws. */
async function hasConfirmedEmail(supabase: SupabaseClient, sub: string, email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return false;
    return isConfirmedOwnerOfEmail(data?.user, sub, email);
  } catch (err) {
    console.warn("[auth] could not read the Supabase user record:", err);
    return false;
  }
}

export async function createSupabaseAuth(): Promise<AuthProvider> {
  return {
    kind: "supabase",

    async getCurrentUser(): Promise<User | null> {
      const supabase = await createSupabaseServerClient();
      const claims = await readClaims(supabase);
      if (!claims?.sub) return null;

      const repo = await getRepo();
      const email = claims.email?.trim().toLowerCase() || undefined;
      // The signup trigger normally created the profile; this covers accounts
      // that existed before the migration ran.
      let user =
        (await repo.getUser(claims.sub)) ??
        (await repo.upsertUser({ id: claims.sub, name: displayName(claims), email }));

      if (email && user.role !== "admin" && adminEmails().includes(email)) {
        // The JWT `email` claim alone does not prove ownership of the address,
        // so ask the auth server (not the cookie) whether it was confirmed.
        if (await hasConfirmedEmail(supabase, claims.sub, email)) {
          user = await repo.setUserRole(user.id, "admin");
        } else {
          console.warn("[auth] an account with an ADMIN_EMAILS address was not promoted: its email is not confirmed.");
        }
      }
      return user;
    },

    async signOut(): Promise<void> {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut();
      if (error) console.warn("[auth] Supabase sign-out failed:", error.message);
    },
  };
}
