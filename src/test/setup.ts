// Runs before every test file. Adds the jest-dom matchers (toBeInTheDocument, ...)
// and unmounts React trees between tests when a DOM environment is active.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Outside a request, cookies() throws. Pages read the interface-language cookie
// (src/lib/i18n/server.ts), so tests get an empty cookie jar: Hebrew, signed out.
// A test file can still vi.mock("next/headers") itself.
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  cookies: async () => new Map<string, { name: string; value: string }>(),
}));

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
