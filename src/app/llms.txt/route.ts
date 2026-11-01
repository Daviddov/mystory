import { MARKDOWN_CONTENT_TYPE } from "@/lib/markdown";
import { loadLlmsTxt } from "@/lib/markdown-pages";

/**
 * /llms.txt (llmstxt.org): a Markdown map of the site for AI agents. Cached
 * like the library pages (src/lib/library-cache.ts): rebuilt at most every
 * 10 minutes, or right away when a published book changes.
 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET(): Promise<Response> {
  return new Response(await loadLlmsTxt(), { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE } });
}
