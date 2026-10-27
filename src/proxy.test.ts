import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FILTER_KEYS } from "@/components/library/filters";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { LIBRARY_QUERY_KEYS, LOCAL_SESSION_COOKIE, libraryRewrite, proxy } from "./proxy";

const query = (value = "") => new URLSearchParams(value);

describe("libraryRewrite", () => {
  it("serves the static pages to signed-out visitors", () => {
    for (const path of [
      "/",
      "/books",
      "/book/snail",
      "/age/3-5",
      "/category/animals",
      "/theme/patience",
      "/time/5",
      "/tag/%D7%92%D7%A9%D7%9D",
      "/collections",
      "/collections/rainy",
    ]) {
      expect(libraryRewrite(path, query(), false), path).toBeNull();
    }
  });

  it("sends signed-in visitors of every library page to the live twin", () => {
    expect(libraryRewrite("/", query(), true)).toBe("/live");
    expect(libraryRewrite("/book/snail", query(), true)).toBe("/live/book/snail");
    expect(libraryRewrite("/books", query(), true)).toBe("/live/books");
    expect(libraryRewrite("/collections/rainy", query(), true)).toBe("/live/collections/rainy");
    expect(libraryRewrite("/holidays/hanukkah", query(), true)).toBe("/live/holidays/hanukkah");
    expect(libraryRewrite("/listen", query(), true)).toBe("/live/listen");
  });

  it("sends listings with a library query to the live twin, and ignores other query strings", () => {
    expect(libraryRewrite("/books", query("age=3-5"), false)).toBe("/live/books");
    expect(libraryRewrite("/category/animals", query("page=2"), false)).toBe("/live/category/animals");
    expect(libraryRewrite("/tag/x", query("sort=popular"), false)).toBe("/live/tag/x");
    expect(libraryRewrite("/parasha/noach", query("page=2"), false)).toBe("/live/parasha/noach");
    expect(libraryRewrite("/listen", query("age=0-2"), false)).toBe("/live/listen");
    expect(libraryRewrite("/books", query("utm_source=news&_rsc=abc"), false)).toBeNull();
    expect(libraryRewrite("/parasha", query("page=2"), false)).toBeNull();
    // Pages that read no query string stay static.
    expect(libraryRewrite("/", query("q=x"), false)).toBeNull();
    expect(libraryRewrite("/book/snail", query("page=2"), false)).toBeNull();
  });

  it("leaves every other route alone", () => {
    for (const path of ["/read/snail", "/search", "/me", "/studio/1", "/book/snail/opengraph-image", "/api/views/1"]) {
      expect(libraryRewrite(path, query("q=x"), true), path).toBeNull();
    }
  });

  it("knows every query key the listings read and the local session cookie", () => {
    expect([...LIBRARY_QUERY_KEYS].sort()).toEqual([...FILTER_KEYS, "sort", "page"].sort());
    expect(LOCAL_SESSION_COOKIE).toBe(SESSION_COOKIE);
  });
});

describe("proxy in local mode", () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  });

  const rewriteOf = (response: Response) => response.headers.get("x-middleware-rewrite");

  it("serves the cached page without a session and the live one with a session cookie", async () => {
    const anonymous = await proxy(new NextRequest("http://localhost/book/secret"));
    expect(rewriteOf(anonymous)).toBeNull();

    const signedIn = await proxy(
      new NextRequest("http://localhost/book/secret", { headers: { cookie: `${SESSION_COOKIE}=token` } }),
    );
    expect(rewriteOf(signedIn)).toBe("http://localhost/live/book/secret");
  });

  it("refuses direct visits to the live twin", async () => {
    for (const path of ["/live", "/live/book/secret"]) {
      const response = await proxy(new NextRequest(`http://localhost${path}`));
      expect(response.status, path).toBe(404);
    }
  });
});
