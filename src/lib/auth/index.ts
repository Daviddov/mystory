/**
 * Auth helpers for Server Components, Server Actions and Route Handlers.
 *
 *   // page:   const user = await requireUserPage("/studio");
 *   // route:  try { const user = await requireRole("editor"); ... }
 *   //         catch (err) { return apiError(err); }       (apiError from "@/lib/api")
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../config";
import { routes } from "../routes";
import type { Book, User, UserRole } from "../types";
import { createLocalAuth } from "./local";
import { AuthError, type AuthProvider } from "./types";

export { AuthError, type AuthProvider } from "./types";
export { isLocalLoginAllowed, signInLocal } from "./local";

const ROLE_RANK: Record<UserRole, number> = { parent: 1, editor: 2, admin: 3 };

/** 'local' = development login (name + email, no password); 'supabase' = real accounts. */
export function authMode(): "local" | "supabase" {
  return isSupabaseConfigured() ? "supabase" : "local";
}

export async function getAuthProvider(): Promise<AuthProvider> {
  if (isSupabaseConfigured()) {
    const mod = await import("./supabase");
    return mod.createSupabaseAuth();
  }
  return createLocalAuth();
}

/** The signed-in user or null. Deduplicated per request during rendering. Makes the route dynamic. */
export const getCurrentUser: () => Promise<User | null> = cache(async () => {
  const provider = await getAuthProvider();
  return provider.getCurrentUser();
});

/** True when `user` has at least the given role (admin > editor > parent). */
export function hasRole(user: Pick<User, "role"> | null | undefined, role: UserRole): boolean {
  return !!user && ROLE_RANK[user.role] >= ROLE_RANK[role];
}

/** Returns the user or throws AuthError(401). */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401);
  return user;
}

/** Returns the user or throws AuthError(401 | 403). Higher roles satisfy lower ones. */
export async function requireRole(role: UserRole): Promise<User> {
  const user = await requireUser();
  if (!hasRole(user, role)) throw new AuthError(403);
  return user;
}

/** For pages: redirects to /login?next=<returnTo> when nobody is signed in. */
export async function requireUserPage(returnTo: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login(returnTo));
  return user;
}

/**
 * For pages: redirects to the login page when signed out, and to the home page
 * when the role is too low.
 */
export async function requireRolePage(role: UserRole, returnTo: string): Promise<User> {
  const user = await requireUserPage(returnTo);
  if (!hasRole(user, role)) redirect(routes.home());
  return user;
}

/** Ends the current session. Only callable from a Server Action or Route Handler. */
export async function signOut(): Promise<void> {
  const provider = await getAuthProvider();
  await provider.signOut();
}

type BookAccess = Pick<Book, "status" | "ownerId" | "shareToken">;

/**
 * Published books are public. Anything else is visible to its owner, to
 * editors and admins, and to anyone holding the book's share token.
 */
export function canViewBook(book: BookAccess, user: User | null, shareToken?: string | null): boolean {
  if (book.status === "published") return true;
  if (user && (user.id === book.ownerId || hasRole(user, "editor"))) return true;
  return !!shareToken && !!book.shareToken && shareToken === book.shareToken;
}

/** Owners edit their own books; editors and admins edit every book. */
export function canEditBook(book: Pick<Book, "ownerId">, user: User | null): boolean {
  return !!user && (user.id === book.ownerId || hasRole(user, "editor"));
}

/**
 * Only allows same-site relative paths as a post-login destination.
 *
 * Browsers strip tabs and newlines from URLs and treat "\" as "/", so
 * "/\t/evil.example" would navigate to "//evil.example". Any whitespace,
 * control character or backslash is refused, and the value is then resolved
 * the way a browser would and must stay on the same origin.
 */
export function safeNextPath(next: string | null | undefined, fallback: string = "/"): string {
  if (!next || next.length > 2000 || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff\\]/.test(next)) {
    return fallback;
  }
  const base = "http://same-origin.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
