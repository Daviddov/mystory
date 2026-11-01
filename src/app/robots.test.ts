/** robots.txt: every user-agent group carries the private paths and the Content Signals. */
import { resolveRobots } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Splits the rendered file into its blank-line separated groups. */
function groups(text: string): string[] {
  return text.trim().split(/\n\s*\n/);
}

describe("robots.txt", () => {
  it("sends the Content Signal and the private paths in every user-agent group", () => {
    const text = resolveRobots(robots());
    const agentGroups = groups(text).filter((g) => g.startsWith("User-Agent:"));
    expect(agentGroups).toHaveLength(2);
    for (const group of agentGroups) {
      expect(group).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
      expect(group).toContain("Disallow: /api/");
      expect(group).toContain("Disallow: /share/");
    }
    expect(agentGroups[0]).toMatch(/^User-Agent: \*$/m);
    expect(agentGroups[1]).toMatch(/^User-Agent: Claude-SearchBot$/m);
  });

  it("points Host and Sitemap at the configured site", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.org/");
    const text = resolveRobots(robots());
    expect(text).toContain("Host: https://example.org\n");
    expect(text).toContain("Sitemap: https://example.org/sitemap.xml\n");
  });
});
