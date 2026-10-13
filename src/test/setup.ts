// Runs before every test file. Adds the jest-dom matchers (toBeInTheDocument, ...)
// and unmounts React trees between tests when a DOM environment is active.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
