/**
 * Proxy (the Next.js 16 name of middleware).
 *
 * Both modes:
 *  - serves the Markdown version of a library page (src/app/md) to clients
 *    whose Accept header prefers text/markdown (see markdownRewrite below);
 *  - picks the static or the dynamic version of a library page (see
 *    libraryRewrite below and src/app/live);
 *  - adds Link headers that point AI agents to /llms.txt and to the Markdown
 *    version of the page (see agentLinks below).
 * Pages protect themselves with requireUserPage() / requireRolePage().
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

/** Interface-language cookie. Same value as LOCALE_COOKIE in src/lib/i18n/locale.ts. */
export const LOCALE_COOKIE = "mystory_lang";

/**
 * Whether the visitor chose a non-default (English) interface. The static
 * library pages are cached in Hebrew, so such a visitor needs the live twin,
 * like a signed-in one.
 */
function wantsOtherLocale(request: NextRequest): boolean {
  const value = request.cookies.get(LOCALE_COOKIE)?.value;
  return value !== undefined && value !== "he";
}

/** Query-string keys the library listings read (src/components/library/filters.ts). */
export const LIBRARY_QUERY_KEYS: readonly string[] = ["age", "category", "theme", "time", "tag", "q", "audio", "nikud", "anim", "read", "lang", "sort", "page"];

/** Library pages that are static for signed-out visitors. */
const LIBRARY_PAGE =
  /^\/(?:books|collections|parasha|holidays|listen|(?:book|age|category|theme|time|tag|collections|parasha|holidays)\/[^/]+)?$/;
/** Of those, the listings whose content depends on the query string. */
const LIBRARY_LISTING = /^\/(?:books|listen|(?:age|category|theme|time|tag|parasha|holidays)\/[^/]+)$/;

/**
 * The library pages are static and cached (ISR), so their HTML must be the
 * same for every signed-out visitor. A request that needs more than that is
 * rewritten to the dynamic twin under /live:
 *   - any library page, when the visitor is signed in or chose the English
 *     interface (`signedIn` covers both);
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

/** Prefix of the Markdown versions of the library pages (src/app/md). */
export const MARKDOWN_PREFIX = "/md";

/** Library pages that have a Markdown version. */
const MARKDOWN_PAGE = /^\/(?:books|collections|(?:book|age|category|theme|time|tag|collections)\/[^/]+)?$/;

/**
 * Whether an Accept header prefers Markdown over HTML: text/markdown is listed
 * with a q at least that of text/html. Wildcards count for neither, so
 * browsers, which list text/html and a wildcard, always get HTML.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  let markdown = 0;
  let html = 0;
  for (const range of accept.split(",")) {
    const [type = "", ...params] = range.split(";").map((part) => part.trim().toLowerCase());
    const q = params.find((param) => param.startsWith("q="));
    const quality = q === undefined ? 1 : Number(q.slice(2));
    if (!Number.isFinite(quality)) continue;
    if (type === "text/markdown" || type === "text/x-markdown") markdown = Math.max(markdown, quality);
    else if (type === "text/html" || type === "application/xhtml+xml") html = Math.max(html, quality);
  }
  return markdown > 0 && markdown >= html;
}

/**
 * The Markdown version of a library page, for a client that prefers it
 * (an AI agent). Every visitor gets the same Markdown, signed in or not, and
 * query strings are ignored. Returns the rewrite target, or null.
 */
export function markdownRewrite(pathname: string, accept: string | null): string | null {
  if (!MARKDOWN_PAGE.test(pathname) || !prefersMarkdown(accept)) return null;
  return pathname === "/" ? MARKDOWN_PREFIX : `${MARKDOWN_PREFIX}${pathname}`;
}

/**
 * Link header (RFC 8288) of an HTML page: /llms.txt describes the site, and a
 * page with a Markdown version names it as an alternate (same address, asked
 * for with Accept: text/markdown). Null for API routes and /llms.txt itself.
 */
export function agentLinks(pathname: string): string | null {
  if (pathname === "/llms.txt" || pathname === "/api" || pathname.startsWith("/api/")) return null;
  const links = ['</llms.txt>; rel="describedby"; type="text/markdown"'];
  if (MARKDOWN_PAGE.test(pathname)) links.push(`<${pathname}>; rel="alternate"; type="text/markdown"`);
  return links.join(", ");
}

/**
 * Adds the agent Link header. (A Vary: Accept set here would not reach the
 * browser: Next.js replaces the Vary header of pages. The Markdown answer
 * carries one; the choice itself is made here, in front of every cache.)
 */
function withAgentLinks(response: NextResponse, pathname: string): NextResponse {
  const links = agentLinks(pathname);
  if (links) response.headers.append("Link", links);
  return response;
}

function isPrivatePath(pathname: string): boolean {
  return [LIVE_PREFIX, MARKDOWN_PREFIX].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The /live twin and the /md versions are reached only through a rewrite. */
function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

function rewriteTo(request: NextRequest, pathname: string): URL {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  return target;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isPrivatePath(request.nextUrl.pathname)) return notFound();

  // Markdown first: it is public and the same for everyone, so it needs no session.
  const markdown = markdownRewrite(request.nextUrl.pathname, request.headers.get("accept"));
  if (markdown) {
    const target = rewriteTo(request, markdown);
    target.search = "";
    const rewritten = NextResponse.rewrite(target);
    rewritten.headers.set("Vary", "Accept");
    return rewritten;
  }

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    // Local mode: a session cookie is enough to send the visitor to the live
    // page, which then checks the session itself.
    const live = libraryRewrite(
      request.nextUrl.pathname,
      request.nextUrl.searchParams,
      request.cookies.has(LOCAL_SESSION_COOKIE) || wantsOtherLocale(request),
    );
    const page = live ? NextResponse.rewrite(rewriteTo(request, live)) : NextResponse.next();
    return withAgentLinks(page, request.nextUrl.pathname);
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
    const live = libraryRewrite(pathname, request.nextUrl.searchParams, signedIn || wantsOtherLocale(request));
    if (!live) return withAgentLinks(response, pathname);
    // Same request (with any refreshed session cookies), rendered by the live route.
    const rewritten = NextResponse.rewrite(rewriteTo(request, live), { request });
    for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) rewritten.headers.set(name, value);
    }
    return withAgentLinks(rewritten, pathname);
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
