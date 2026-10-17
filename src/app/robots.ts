import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

/**
 * The library is public. Personal areas, the tools for making books, share
 * links (private books) and the print and API routes stay out of search engines.
 */
const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/studio",
  "/create",
  "/me",
  "/login",
  "/logout",
  "/share/",
  "/print/",
  "/offline",
  "/search",
];

/**
 * Search crawlers of AI assistants (answers that cite and link the source).
 * Named explicitly so a future blanket rule for AI training bots cannot shut
 * them out by accident.
 */
const AI_SEARCH_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User"];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: AI_SEARCH_BOTS, allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
