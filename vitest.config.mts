import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // "server-only" throws outside the Next.js server bundle; tests use an empty module.
      "server-only": path.resolve(root, "src/test/server-only.ts"),
    },
  },
  test: {
    // Default: Node. For component tests put `// @vitest-environment jsdom` at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    globals: false,
    restoreMocks: true,
  },
});
