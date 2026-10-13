/** Server-side authorisation for the admin console (pages and API routes). */
import "server-only";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { hasRole, requireRole, requireRolePage } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/same-origin";
import type { User, UserRole } from "@/lib/types";
import { adminPaths } from "./paths";

/**
 * For admin pages. The layout also checks, but layouts are not re-rendered on
 * client navigation, so every page calls this itself.
 * Signed out -> login; a parent -> home; an editor on an admin-only page -> admin home.
 */
export async function requireAdminPage(returnTo: string, role: "editor" | "admin" = "editor"): Promise<User> {
  const user = await requireRolePage("editor", returnTo);
  if (!hasRole(user, role)) redirect(adminPaths.home());
  return user;
}

/** For admin route handlers: same-origin check (@/lib/same-origin), then role check. Throws AuthError. */
export async function requireAdminApi(request: Request, role: UserRole = "editor"): Promise<User> {
  assertSameOrigin(request);
  return requireRole(role);
}

/** Parses a JSON body with a zod schema. Throws ZodError (-> 400 through apiError). */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await request.json().catch(() => undefined);
  return schema.parse(body);
}
