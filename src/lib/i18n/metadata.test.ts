import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ lang: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "mystory_lang" && jar.lang ? { value: jar.lang } : undefined) }),
}));

import { localizeTitle } from "./metadata";

describe("localizeTitle", () => {
  beforeEach(() => {
    jar.lang = undefined;
  });

  it("keeps the Hebrew metadata for Hebrew visitors and search engines", async () => {
    const meta = { title: "שאלות ותשובות", description: "תיאור" };
    expect(await localizeTitle(meta, "Questions and answers")).toBe(meta);
  });

  it("swaps only the title for English visitors", async () => {
    jar.lang = "en";
    const meta = { title: "שאלות ותשובות", description: "תיאור", alternates: { canonical: "/faq" } };
    expect(await localizeTitle(meta, "Questions and answers")).toEqual({ ...meta, title: "Questions and answers" });
    expect(await localizeTitle(Promise.resolve(meta), { absolute: "Home | My Story" })).toMatchObject({
      title: { absolute: "Home | My Story" },
      description: "תיאור",
    });
  });

  it("translates the generic not-found titles without an English title", async () => {
    jar.lang = "en";
    expect((await localizeTitle({ title: "הספר לא נמצא" })).title).toBe("Book not found");
    expect((await localizeTitle({ title: "כותרת אחרת" })).title).toBe("כותרת אחרת");
  });
});
