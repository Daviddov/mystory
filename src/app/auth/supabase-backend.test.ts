/**
 * What can be checked without a Supabase project: mode switching, the proxy's
 * routing decisions and media bucket routing. Nothing here talks to Supabase.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { AUDIO_BUCKET, FILE_BUCKET, IMAGE_BUCKET, SupabaseMediaStore, bucketForPath } from "@/lib/media/supabase";
import { getSupabaseAdmin } from "@/lib/repo/supabase";
import { proxy } from "@/proxy";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function setSupabaseEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

afterEach(() => setSupabaseEnv({}));

describe("proxy", () => {
  it("passes every request through in local mode", async () => {
    setSupabaseEnv({});
    for (const path of ["/", "/studio", "/admin", "/login?next=/me"]) {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("sends signed-out visitors of protected routes to the sign-in page in Supabase mode", async () => {
    setSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    const response = await proxy(new NextRequest("http://localhost:3000/studio/new?x=1"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/sign-in");
    expect(location.searchParams.get("next")).toBe("/studio/new?x=1");
  });

  it("does not treat look-alike paths as protected, and leaves public pages alone", async () => {
    setSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    for (const path of ["/", "/book/some-book", "/media-kit", "/creative", "/menu"]) {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("replaces /login with the Supabase sign-in page and keeps the query", async () => {
    setSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    const response = await proxy(new NextRequest("http://localhost:3000/login?next=%2Fme"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/sign-in");
    expect(location.searchParams.get("next")).toBe("/me");
  });
});

describe("Supabase media store", () => {
  it("routes a media path to one bucket by extension", () => {
    expect(bucketForPath("books/bk_1/page-01.png")).toBe(IMAGE_BUCKET);
    expect(bucketForPath("books/bk_1/cover.svg")).toBe(IMAGE_BUCKET);
    expect(bucketForPath("books/bk_1/page-01.mp3")).toBe(AUDIO_BUCKET);
    expect(bucketForPath("books/bk_1/page-01.webm")).toBe(AUDIO_BUCKET);
    expect(bucketForPath("books/bk_1/source.pdf")).toBe(FILE_BUCKET);
    // Animated illustrations: book-files accepts any MIME type, so mp4 needs no migration.
    expect(bucketForPath("books/bk_1/page-01.mp4")).toBe(FILE_BUCKET);
    expect(bucketForPath("books/bk_1/unknown.bin")).toBe(FILE_BUCKET);
  });

  it("points browsers at the site's own /media route (never a public bucket URL) and rejects unsafe paths", () => {
    const store = new SupabaseMediaStore({} as never, "https://example.supabase.co");
    expect(store.url("books/bk_1/page-01.png")).toBe("/media/books/bk_1/page-01.png");
    expect(() => store.url("books/../secret.png")).toThrow();
  });

  it("signs a download URL in the right bucket, and reports a missing file as null", async () => {
    const calls: unknown[] = [];
    const fake = (result: unknown) => ({
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string, expiresIn: number) => {
            calls.push([bucket, path, expiresIn]);
            return result;
          },
        }),
      },
    });
    const signed = "https://example.supabase.co/storage/v1/object/sign/book-audio/books/bk_1/p.mp3?token=abc";
    const ok = new SupabaseMediaStore(fake({ data: { signedUrl: signed }, error: null }) as never, "https://example.supabase.co");
    expect(await ok.signedUrl("books/bk_1/p.mp3", 600)).toBe(signed);
    expect(calls).toEqual([[AUDIO_BUCKET, "books/bk_1/p.mp3", 600]]);

    const missing = new SupabaseMediaStore(
      fake({ data: null, error: { message: "Object not found", status: 404 } }) as never,
      "https://example.supabase.co",
    );
    expect(await missing.signedUrl("books/bk_1/gone.mp3", 600)).toBeNull();
    await expect(ok.signedUrl("books/../secret.png", 600)).rejects.toThrow();
  });
});

describe("service-role client", () => {
  it("fails loudly when Supabase is enabled without the service-role key", () => {
    setSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(() => getSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
