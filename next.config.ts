import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (and Partial Prefetching, which depends on it) are
  // deliberately OFF: pages read live data from the repository and the session
  // cookie on every request, and the classic model keeps that simple
  // (`export const dynamic = "force-dynamic"` where needed).
  cacheComponents: false,
  // Native / worker-based packages must be loaded from node_modules at runtime.
  // (pdfjs-dist runs only in the browser, in the import studio, so it is bundled normally.)
  serverExternalPackages: ["sharp"],
  // The PDF route reads these font files from node_modules at runtime; a traced
  // (serverless) deployment must be told to ship them.
  outputFileTracingIncludes: {
    "/api/pdf/[slug]": [
      "./node_modules/@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-{hebrew,latin}-{400,700}-normal.woff",
    ],
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or an old worker keeps running.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Uploads (images, audio, zip packages) go through Server Actions and Route Handlers.
      bodySizeLimit: "50mb",
    },
    // src/proxy.ts runs in front of every /api route, and Next.js buffers a
    // request body for the proxy only up to this size (default 10MB): anything
    // longer reaches the route handler silently cut off. It must stay above the
    // largest upload a route accepts: IMPORT_LIMITS.pagesRequestBytes (80MB) in
    // src/lib/importers/limits.ts. A test (src/lib/limits.test.ts) compares the two.
    proxyClientMaxBodySize: "85mb",
  },
  turbopack: {
    // A lockfile in a parent folder must not be mistaken for the workspace root.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
