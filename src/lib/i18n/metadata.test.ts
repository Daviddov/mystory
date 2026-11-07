import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ lang: undefined as string | undefined, englishAddress: false }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(jar.englishAddress ? { "x-mystory-locale": "en" } : {}),
  cookies: async () => ({ get: (name: string) => (name === "mystory_lang" && jar.lang ? { value: jar.lang } : undefined) }),
}));

import { localizeTitle } from "./metadata";

describe("localizeTitle", () => {
  beforeEach(() => {
    jar.lang = undefined;
    jar.englishAddress = false;
  });

  const faq = { title: "שאלות ותשובות", description: "תיאור", alternates: { canonical: "/faq" } };
  const languages = { he: "/faq", en: "/en/faq", "x-default": "/faq" };

  it("keeps the Hebrew page for Hebrew visitors and search engines, and names its English twin", async () => {
    expect(await localizeTitle(faq, "Questions and answers")).toEqual({
      ...faq,
      alternates: { canonical: "/faq", languages },
    });
  });

  it("leaves pages without an English twin, and pages kept out of the index, without hreflang", async () => {
    const reader = { title: "קוראים", alternates: { canonical: "/read/snail" } };
    expect(await localizeTitle(reader)).toBe(reader);
    const hidden = { ...faq, robots: { index: false } };
    expect((await localizeTitle(hidden)).alternates).toEqual({ canonical: "/faq" });
  });

  it("gives English visitors an English title and description", async () => {
    jar.lang = "en";
    const meta = await localizeTitle(faq, "Questions and answers", "Answers to common questions.");
    expect(meta).toMatchObject({
      title: "Questions and answers",
      description: "Answers to common questions.",
      alternates: { canonical: "/faq", languages },
    });
    expect(await localizeTitle(Promise.resolve(faq), { absolute: "Home | My Story" })).toMatchObject({
      title: { absolute: "Home | My Story" },
    });
    // A page without an English description gets the site's, not a Hebrew sentence.
    expect((await localizeTitle(faq, "Questions")).description).toMatch(/^Hebrew children's stories/);
  });

  it("makes an /en address its own canonical, with English share cards", async () => {
    jar.englishAddress = true;
    const meta = await localizeTitle({ ...faq, openGraph: { title: "שאלות", locale: "he_IL", url: "/faq" } }, "Questions", "Answers.");
    expect(meta.alternates).toEqual({ canonical: "/en/faq", languages });
    expect(meta.openGraph).toMatchObject({ title: "Questions", locale: "en_US", url: "/en/faq" });
    expect(meta.title).toBe("Questions");
  });

  it("translates the generic not-found titles without an English title", async () => {
    jar.lang = "en";
    expect((await localizeTitle({ title: "הספר לא נמצא" })).title).toBe("Book not found");
    expect((await localizeTitle({ title: "כותרת אחרת" })).title).toBe("כותרת אחרת");
  });
});
