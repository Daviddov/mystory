/**
 * Proxy (the Next.js 16 name of middleware).
 *
 * Both modes: picks the static or the dynamic version of a library page (see
 * libraryRewrite below and src/app/live). Pages protect themselves with
 * requireUserPage() / requireRolePage().
 *
 * Supabase mode, in addition:
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

/** Prefix of the dynamic twin of the library pages (src/app/live). */
export const LIVE_PREFIX = "/live";

/** Session cookie of the local (development) login. Same value as SESSION_COOKIE in src/lib/auth/session.ts. */
export const LOCAL_SESSION_COOKIE = "mystory_session";

/** Query-string keys the library listings read (src/components/library/filters.ts). */
export const LIBRARY_QUERY_KEYS: readonly string[] = ["age", "category", "theme", "time", "tag", "q", "audio", "nikud", "anim", "sort", "page"];

/** Library pages that are static for signed-out visitors. */
const LIBRARY_PAGE = /^\/(?:books|collections|(?:book|age|category|theme|time|tag|collections)\/[^/]+)?$/;
/** Of those, the listings whose content depends on the query string. */
const LIBRARY_LISTING = /^\/(?:books|(?:age|category|theme|time|tag)\/[^/]+)$/;

/**
 * The library pages are static and cached (ISR), so their HTML must be the
 * same for every signed-out visitor. A request that needs more than that is
 * rewritten to the dynamic twin under /live:
 *   - any library page, when the visitor is signed in;
 *   - a listing with a library query (filters, sort, page).
 * Other query strings (utm_*, _rsc, ...) keep the static page.
 * Returns the rewrite target, or null to serve the page as it is.
 */
export function libraryRewrite(pathname: string, searchParams: URLSearchParams, signedIn: boolean): string | null {
  if (!LIBRARY_PAGE.test(pathname)) return null;
  const queried = LIBRARY_LISTING.test(pathname) && LIBRARY_QUERY_KEYS.some((key) => searchParams.has(key));
  if (!signedIn && !queried) return null;
  return pathname === "/" ? LIVE_PREFIX : `${LIVE_PREFIX}${pathname}`;
}

function isLivePath(pathname: string): boolean {
  return pathname === LIVE_PREFIX || pathname.startsWith(`${LIVE_PREFIX}/`);
}

/** The /live twin is reached only through a rewrite. */
function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

function rewriteTo(request: NextRequest, pathname: string): URL {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  return target;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isLivePath(request.nextUrl.pathname)) return notFound();

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    // Local mode: a session cookie is enough to send the visitor to the live
    // page, which then checks the session itself.
    const live = libraryRewrite(
      request.nextUrl.pathname,
      request.nextUrl.searchParams,
      request.cookies.has(LOCAL_SESSION_COOKIE),
    );
    return live ? NextResponse.rewrite(rewriteTo(request, live)) : NextResponse.next();
  }

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
  if (!target) {
    const live = libraryRewrite(pathname, request.nextUrl.searchParams, signedIn);
    if (!live) return response;
    // Same request (with any refreshed session cookies), rendered by the live route.
    const rewritten = NextResponse.rewrite(rewriteTo(request, live), { request });
    for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) rewritten.headers.set(name, value);
    }
    return rewritten;
  }

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
