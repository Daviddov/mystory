/**
 * English addresses of the public pages. Client-safe.
 *
 * Every public library page also exists at /en/<same path> in English (the
 * interface, titles and descriptions; a book is still shown in its own
 * language). Search engines see no cookies, so a separate address is what lets
 * them index the English pages: each version names the other with hreflang.
 *
 * src/proxy.ts serves /en/... by rewriting it to the Hebrew page's dynamic
 * twin and marking the request with LOCALE_HEADER. Its copy of ENGLISH_PAGE is
 * kept in step by a test (src/proxy.test.ts).
 */

/** Address prefix of the English pages. */
export const EN_PREFIX = "/en";

/** Request header set by src/proxy.ts for a page served from an /en address. */
export const LOCALE_HEADER = "x-mystory-locale";

/** Pages that have an English address: the library pages, and the two information pages. */
export const ENGLISH_PAGE =
  /^\/(?:books|collections|parasha|holidays|listen|about|faq|(?:book|age|category|theme|time|tag|collections|parasha|holidays)\/[^/]+)?$/;

/** Path of an address, without its query string or fragment. */
function pathnameOf(path: string): string {
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}

/** Whether the (Hebrew) path has an English twin at /en. */
export function hasEnglishPage(path: string): boolean {
  return path.startsWith("/") && ENGLISH_PAGE.test(pathnameOf(path));
}

/** The English address of a Hebrew path: "/" gives "/en", "/book/x?a=1" gives "/en/book/x?a=1". */
export function englishPath(path: string): string {
  if (path === "/") return EN_PREFIX;
  if (path.startsWith("/?") || path.startsWith("/#")) return `${EN_PREFIX}${path.slice(1)}`;
  return `${EN_PREFIX}${path}`;
}

/** The path under /en ("/en" gives "/", "/en/book/x" gives "/book/x"); null for any other address. */
export function stripEnglishPrefix(pathname: string): string | null {
  if (pathname === EN_PREFIX) return "/";
  return pathname.startsWith(`${EN_PREFIX}/`) ? pathname.slice(EN_PREFIX.length) : null;
}

/** The Hebrew path of an address, whichever language it is in. */
export function hebrewPath(path: string): string {
  const pathname = pathnameOf(path);
  const stripped = stripEnglishPrefix(pathname);
  return stripped === null ? path : `${stripped}${path.slice(pathname.length)}`;
}

/** The path as the given language's address: /en-prefixed for English where the page has an English twin. */
export function localizedPath(path: string, locale: "he" | "en"): string {
  return locale === "en" && hasEnglishPage(path) ? englishPath(path) : path;
}
