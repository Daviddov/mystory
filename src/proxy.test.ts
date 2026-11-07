import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FILTER_KEYS } from "@/components/library/filters";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { ENGLISH_PAGE } from "@/lib/i18n/paths";
import {
  LIBRARY_QUERY_KEYS,
  LOCALE_HEADER,
  englishRewrite,
  LOCAL_SESSION_COOKIE,
  agentLinks,
  libraryRewrite,
  markdownRewrite,
  prefersMarkdown,
  proxy,
} from "./proxy";

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

describe("englishRewrite", () => {
  it("sends the English library pages to the live twin and the information pages to themselves", () => {
    expect(englishRewrite("/en")).toBe("/live");
    expect(englishRewrite("/en/books")).toBe("/live/books");
    expect(englishRewrite("/en/book/snail")).toBe("/live/book/snail");
    expect(englishRewrite("/en/parasha/bereshit")).toBe("/live/parasha/bereshit");
    expect(englishRewrite("/en/about")).toBe("/about");
    expect(englishRewrite("/en/faq")).toBe("/faq");
  });

  it("leaves other addresses alone", () => {
    for (const path of ["/", "/books", "/en/read/snail", "/en/studio", "/en/login", "/en/book", "/en/book/a/b", "/english", "/en2/books"]) {
      expect(englishRewrite(path), path).toBeNull();
    }
  });

  it("covers the same pages as the shared pattern", () => {
    for (const path of ["/", "/books", "/book/x", "/about", "/faq", "/tag/%D7%92", "/read/x", "/studio", "/book", "/api/x"]) {
      expect(englishRewrite(path === "/" ? "/en" : `/en${path}`) !== null, path).toBe(ENGLISH_PAGE.test(path));
    }
  });
});

describe("prefersMarkdown", () => {
  it("prefers Markdown only when it is asked for at least as much as HTML", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.9, */*;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/html;q=0.5, text/markdown")).toBe(true);
    expect(prefersMarkdown("Text/Markdown; charset=utf-8")).toBe(true);
    expect(prefersMarkdown("text/x-markdown")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown;q=0.9")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });

  it("gives browsers and wildcards HTML", () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/*")).toBe(false);
    expect(
      prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"),
    ).toBe(false);
  });
});

describe("markdownRewrite", () => {
  const md = "text/markdown";

  it("sends Markdown requests for library pages to /md", () => {
    expect(markdownRewrite("/", md)).toBe("/md");
    expect(markdownRewrite("/book/snail", md)).toBe("/md/book/snail");
    expect(markdownRewrite("/books", md)).toBe("/md/books");
    expect(markdownRewrite("/age/3-5", md)).toBe("/md/age/3-5");
    expect(markdownRewrite("/category/animals", md)).toBe("/md/category/animals");
    expect(markdownRewrite("/theme/patience", md)).toBe("/md/theme/patience");
    expect(markdownRewrite("/time/5", md)).toBe("/md/time/5");
    expect(markdownRewrite("/tag/%D7%92%D7%A9%D7%9D", md)).toBe("/md/tag/%D7%92%D7%A9%D7%9D");
    expect(markdownRewrite("/collections", md)).toBe("/md/collections");
    expect(markdownRewrite("/collections/rainy", md)).toBe("/md/collections/rainy");
  });

  it("leaves HTML requests and pages without a Markdown version alone", () => {
    expect(markdownRewrite("/book/snail", "text/html")).toBeNull();
    expect(markdownRewrite("/book/snail", null)).toBeNull();
    for (const path of ["/read/snail", "/search", "/me", "/book/snail/opengraph-image", "/api/views/1", "/llms.txt"]) {
      expect(markdownRewrite(path, md), path).toBeNull();
    }
  });
});

describe("agentLinks", () => {
  it("points every page to /llms.txt, and pages with a Markdown version to it", () => {
    expect(agentLinks("/read/snail")).toBe('</llms.txt>; rel="describedby"; type="text/markdown"');
    expect(agentLinks("/book/snail")).toBe(
      '</llms.txt>; rel="describedby"; type="text/markdown", </book/snail>; rel="alternate"; type="text/markdown"',
    );
    expect(agentLinks("/")).toContain('</>; rel="alternate"; type="text/markdown"');
  });

  it("adds nothing to API routes and to /llms.txt", () => {
    expect(agentLinks("/api/views/1")).toBeNull();
    expect(agentLinks("/llms.txt")).toBeNull();
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

  it("serves Markdown to clients that prefer it, signed in or not, without the query string", async () => {
    const anonymous = await proxy(
      new NextRequest("http://localhost/book/snail?page=2", { headers: { accept: "text/markdown" } }),
    );
    expect(rewriteOf(anonymous)).toBe("http://localhost/md/book/snail");
    expect(anonymous.headers.get("vary")).toBe("Accept");

    const signedIn = await proxy(
      new NextRequest("http://localhost/books", {
        headers: { accept: "text/markdown", cookie: `${SESSION_COOKIE}=token` },
      }),
    );
    expect(rewriteOf(signedIn)).toBe("http://localhost/md/books");
  });

  it("adds the Link header to HTML pages", async () => {
    const page = await proxy(new NextRequest("http://localhost/book/snail", { headers: { accept: "text/html" } }));
    expect(rewriteOf(page)).toBeNull();
    expect(page.headers.get("link")).toContain('</book/snail>; rel="alternate"; type="text/markdown"');

    const live = await proxy(
      new NextRequest("http://localhost/category/animals", { headers: { cookie: `${SESSION_COOKIE}=token` } }),
    );
    expect(rewriteOf(live)).toBe("http://localhost/live/category/animals");
    expect(live.headers.get("link")).toContain('</category/animals>; rel="alternate"');

    const reader = await proxy(new NextRequest("http://localhost/read/snail"));
    expect(reader.headers.get("link")).toBe('</llms.txt>; rel="describedby"; type="text/markdown"');
  });

  it("serves /en addresses in English, and never trusts the language header from a client", async () => {
    const english = await proxy(new NextRequest("http://localhost/en/book/snail"));
    expect(rewriteOf(english)).toBe("http://localhost/live/book/snail");
    expect(english.headers.get("x-middleware-request-" + LOCALE_HEADER)).toBe("en");
    expect(english.headers.get("set-cookie")).toContain("mystory_lang=en");

    const hebrew = await proxy(new NextRequest("http://localhost/book/snail", { headers: { [LOCALE_HEADER]: "en" } }));
    expect(rewriteOf(hebrew)).toBeNull();
    expect(hebrew.headers.get("x-middleware-request-" + LOCALE_HEADER)).toBeNull();

    expect((await proxy(new NextRequest("http://localhost/en/read/snail"))).headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("refuses direct visits to the live twin and the Markdown versions", async () => {
    for (const path of ["/live", "/live/book/secret", "/md", "/md/book/snail"]) {
      const response = await proxy(new NextRequest(`http://localhost${path}`));
      expect(response.status, path).toBe(404);
    }
  });
});
