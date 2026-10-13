/**
 * Proxy (the Next.js 16 name of middleware).
 *
 * Local mode (no Supabase env vars): does nothing. Pages protect themselves
 * with requireUserPage() / requireRolePage().
 *
 * Supabase mode:
 *  1. Refreshes an expiring session and writes the new cookies, which Server
 *     Components cannot do.
 *  2. Sends signed-out visitors of /studio, /create, /me and /admin to the
 *     sign-in page. This is a first gate only: every page, Route Handler and
 *     Server Action still checks the user and the role itself.
 *  3. Sends /login to /auth/sign-in, the Supabase sign-in page.
 *
 * Self-contained on purpose: it reads the environment directly and imports no
 * application modules.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/studio", "/create", "/me", "/admin"];
const SIGN_IN_PATH = "/auth/sign-in";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // The refreshed tokens must reach both this request's render (request
        // cookies) and the browser (response cookies).
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not run code between createServerClient and getClaims: this call is
  // what refreshes the session.
  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !error && !!data?.claims?.sub;
  } catch (err) {
    console.warn("[proxy] could not verify the Supabase session:", err);
  }

  const { pathname, search } = request.nextUrl;
  let target: URL | null = null;
  if (pathname === "/login") {
    target = new URL(SIGN_IN_PATH, request.url);
    target.search = search;
  } else if (!signedIn && isProtected(pathname)) {
    target = new URL(SIGN_IN_PATH, request.url);
    target.searchParams.set("next", `${pathname}${search}`);
  }
  if (!target) return response;

  // Keep any refreshed session cookies on the redirect.
  const redirectResponse = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
  redirectResponse.headers.set("Cache-Control", "private, no-store");
  return redirectResponse;
}

export const config = {
  matcher: [
    // Everything except static assets and media files, which carry no session.
    "/((?!_next/static|_next/image|media/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp3|wav|ogg|woff|woff2|css|js|map)$).*)",
  ],
};
