/**
 * Markdown versions of the public library pages, for AI agents.
 *
 * src/proxy.ts rewrites a request for a library page whose Accept header
 * prefers text/markdown here (/book/snail -> /md/book/snail), keeping the
 * address; browsers keep getting the HTML page. Visitors cannot open /md/...
 * directly: the proxy answers 404, as for /live.
 *
 * Cached like the library pages (src/lib/library-cache.ts). Published books
 * only; anything else is a 404 in Markdown.
 */
import { markdownPage } from "@/lib/markdown-pages";

export const dynamic = "force-static";
export const revalidate = 600;

/** Each page is rendered on its first request, then cached. */
export function generateStaticParams(): { path: string[] }[] {
  return [];
}

export async function GET(_request: Request, context: RouteContext<"/md/[[...path]]">): Promise<Response> {
  return markdownPage((await context.params).path ?? []);
}
