import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

/**
 * The library is public. Personal areas, the tools for making books, share
 * links (private books) and the print and API routes stay out of search engines.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
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
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
