import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

let lang: string | undefined;
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  cookies: async () => ({ get: (name: string) => (name === "mystory_lang" && lang ? { name, value: lang } : undefined) }),
  headers: async () => new Headers(),
}));

const { apiError, jsonError } = await import("./api");

describe("API error messages follow the interface language", () => {
  it("keeps Hebrew without the cookie and translates with the English cookie", async () => {
    lang = undefined;
    expect(await (await jsonError(404, "הספר לא נמצא")).json()).toEqual({ error: "הספר לא נמצא" });
    lang = "en";
    const res = await jsonError(404, "הספר לא נמצא");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "We couldn't find this book." });
  });

  it("translates apiError but not the zod details", async () => {
    lang = "en";
    const body = (await (await apiError(new ZodError([]))).json()) as { error: string; details: unknown };
    expect(body.error).toBe("Some of the details sent aren't valid. Please check them and try again.");
    expect(body.details).toEqual([]);
  });
});
