/**
 * Smoke tests: render the real library pages to HTML against a temp data dir.
 * They check what a visitor may see (only published books) and that every
 * page renders; they do not replace looking at the pages in a browser.
 */
import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: async () => state.user,
}));

import HomePage from "@/app/page";
import AgePage from "@/app/age/[group]/page";
import BookPage, { generateMetadata as bookMetadata } from "@/app/book/[slug]/page";
import BooksPage, { generateMetadata as booksMetadata } from "@/app/books/page";
import CategoryPage from "@/app/category/[slug]/page";
import CollectionPage from "@/app/collections/[slug]/page";
import CollectionsPage from "@/app/collections/page";
import SearchPage, { generateMetadata as searchMetadata } from "@/app/search/page";
import TagPage from "@/app/tag/[tag]/page";
import ThemePage from "@/app/theme/[slug]/page";
import TimePage from "@/app/time/[bucket]/page";

async function html(node: ReactNode): Promise<string> {
  const { prelude } = await prerender(node);
  return new Response(prelude).text();
}

const SECRET_TITLE = "ספר סודי מאוד";

describe("library pages", () => {
  let data: TempData;

  beforeEach(async () => {
    state.user = null;
    data = await createTempData({ setEnv: true });
    const { repo } = data;
    await repo.createBook({
      id: "pub-snail",
      slug: "snail",
      title: "השבלול",
      summary: "שבלול אחד <script>alert(1)</script> יוצא לדרך.",
      author: "דנה כותבת",
      illustrator: "רון מצייר",
      license: "CC BY 4.0",
      source: "https://example.org/snail",
      ownerId: "system",
      status: "published",
      ageGroup: "3-5",
      readingMinutes: 4,
      categories: ["animals", "friendship"],
      themes: ["patience"],
      tags: ["יום הולדת", "גשם"],
      discussionQuestions: ["למה השבלול איחר?"],
      viewCount: 10,
      pages: [{ index: 0, text: "היה היה שבלול" }],
    });
    await repo.createBook({
      id: "pub-cat",
      slug: "cat",
      title: "החתולה",
      summary: "חתולה סקרנית.",
      source: "javascript:alert(1)",
      ownerId: "system",
      status: "published",
      ageGroup: "3-5",
      readingMinutes: 12,
      categories: ["animals"],
      tags: ["גשם"],
      viewCount: 3,
      pages: [{ index: 0, text: "מיאו", audio: "books/pub-cat/p1.wav", audioSource: "mock" }],
    });
    await repo.createBook({
      id: "priv-1",
      slug: "secret",
      title: SECRET_TITLE,
      ownerId: "u_owner",
      status: "private",
      ageGroup: "3-5",
      readingMinutes: 4,
      categories: ["animals"],
      themes: ["patience"],
      tags: ["גשם"],
      viewCount: 999,
      pages: [{ index: 0, text: "סוד" }],
    });
    await repo.createCollection({
      id: "col-w",
      slug: "rainy",
      title: "ימים של גשם",
      description: "לחורף",
      season: "winter",
      bookIds: ["priv-1", "pub-cat", "pub-snail"],
    });
    await repo.setSettings({ bookOfTheWeekId: "pub-snail" });
  });

  afterEach(async () => {
    await data.cleanup();
  });

  const params = <T,>(value: T) => Promise.resolve(value);

  it("renders the home page with its sections and no unpublished book", async () => {
    const out = await html(await HomePage());
    expect(out).toContain("ספר השבוע");
    expect(out).toContain("חדש בספרייה");
    expect(out).toContain("הכי פופולריים");
    expect(out).toContain("בוחרים לפי גיל");
    expect(out).toContain("כמה זמן יש לנו?");
    expect(out).toContain("ימים של גשם");
    expect(out).toContain('href="/category/animals"');
    expect(out).toContain('href="/read/snail"');
    expect(out).not.toContain(SECRET_TITLE);
  });

  it("renders the home page when the library is empty", async () => {
    await data.repo.deleteBook("pub-snail");
    await data.repo.deleteBook("pub-cat");
    const out = await html(await HomePage());
    expect(out).toContain("הספרייה עוד ריקה");
    expect(out).not.toContain(SECRET_TITLE);
  });

  it("renders every browse page with published books only", async () => {
    const pages: [string, Promise<ReactNode>][] = [
      ["age", AgePage({ params: params({ group: "3-5" }), searchParams: params({}) })],
      ["category", CategoryPage({ params: params({ slug: "animals" }), searchParams: params({}) })],
      ["theme", ThemePage({ params: params({ slug: "patience" }), searchParams: params({}) })],
      ["time", TimePage({ params: params({ bucket: "5" }), searchParams: params({}) })],
      ["tag", TagPage({ params: params({ tag: encodeURIComponent("גשם") }), searchParams: params({}) })],
      ["books", BooksPage({ searchParams: params({ status: "any", sort: "popular" }) })],
      ["collections", CollectionsPage()],
      ["collection", CollectionPage({ params: params({ slug: "rainy" }) })],
      ["search", SearchPage({ searchParams: params({ q: "ספר" }) })],
    ];
    for (const [name, page] of pages) {
      const out = await html(await page);
      expect(out, name).not.toContain(SECRET_TITLE);
      expect(out, name).toContain("<h1");
    }
  });

  it("combines filters on the all-books page", async () => {
    const out = await html(await BooksPage({ searchParams: params({ age: "3-5", category: "animals", time: "15" }) }));
    expect(out).toContain("החתולה");
    expect(out).not.toContain(">השבלול<");
    expect(out).toContain("ספר אחד");
    // Removable chip for one filter keeps the others.
    expect(out).toContain('href="/books?age=3-5&amp;category=animals"');
  });

  it("applies the second age filter on a category page", async () => {
    const out = await html(await CategoryPage({ params: params({ slug: "animals" }), searchParams: params({ age: "6-8" }) }));
    expect(out).toContain("אין ספרים לגיל שבחרתם");
    expect(out).not.toContain("החתולה");
  });

  it("keeps the collection order", async () => {
    const out = await html(await CollectionPage({ params: params({ slug: "rainy" }) }));
    expect(out.indexOf("החתולה")).toBeGreaterThan(-1);
    expect(out.indexOf("החתולה")).toBeLessThan(out.indexOf("השבלול"));
    expect(out).toContain("חורף");
  });

  it("finds a tag with a space through its URL slug", async () => {
    const out = await html(
      await TagPage({ params: params({ tag: encodeURIComponent("יום-הולדת") }), searchParams: params({}) }),
    );
    expect(out).toContain("השבלול");
    expect(out).toContain("יום הולדת");
    expect(out).not.toContain("החתולה</h3>");
  });

  it("searches, and offers suggestions when nothing is found", async () => {
    const found = await html(await SearchPage({ searchParams: params({ q: "שבלול" }) }));
    expect(found).toContain("השבלול");
    expect(found).not.toContain("אין תוצאות");
    const none = await html(await SearchPage({ searchParams: params({ q: "דינוזאור" }) }));
    expect(none).toContain("אין תוצאות");
    expect(none).toContain("תגיות נפוצות");
    const start = await html(await SearchPage({ searchParams: params({}) }));
    expect(start).toContain("הכי פופולריים");
  });

  it("rejects unknown taxonomy values", async () => {
    await expect(AgePage({ params: params({ group: "9-12" }), searchParams: params({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CategoryPage({ params: params({ slug: "nope" }), searchParams: params({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ThemePage({ params: params({ slug: "nope" }), searchParams: params({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(TimePage({ params: params({ bucket: "7" }), searchParams: params({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CollectionPage({ params: params({ slug: "../x" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(BookPage({ params: params({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the book page with all details and escapes book text", async () => {
    const out = await html(await BookPage({ params: params({ slug: "snail" }) }));
    for (const text of [
      "השבלול",
      "דנה כותבת",
      "רון מצייר",
      "CC BY 4.0",
      "https://example.org/snail",
      "בואו נקרא",
      'href="/read/snail"',
      "למה השבלול איחר?",
      "שאלות לשיחה אחרי הסיפור",
      'href="/category/animals"',
      'href="/theme/patience"',
      "עוד ספרים כאלה",
      "החתולה",
      "לספר הזה עוד אין הקראה",
      // Signed-out readers get the device favorite button (no login wall), print and offline download.
      'aria-label="הוספה למועדפים: השבלול"',
      'href="/print/snail"',
      "הורדה לקריאה בלי רשת",
      "application/ld+json",
    ]) {
      expect(out, text).toContain(text);
    }
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).not.toContain(SECRET_TITLE);
    expect(out).not.toContain('href="/login');
  });

  it("offers listening and flags demo audio, and never links a non-http source", async () => {
    const out = await html(await BookPage({ params: params({ slug: "cat" }) }));
    expect(out).toContain("האזנה לסיפור");
    expect(out).toContain("קול הדגמה");
    expect(out).not.toContain('href="javascript:');
  });

  it("hides a private book from visitors and from its metadata, but shows it to the owner", async () => {
    await expect(BookPage({ params: params({ slug: "secret" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await bookMetadata({ params: params({ slug: "secret" }) })).title).toBe("הספר לא נמצא");

    state.user = { id: "u_other", name: "אחר", role: "parent" };
    await expect(BookPage({ params: params({ slug: "secret" }) })).rejects.toThrow("NEXT_NOT_FOUND");

    state.user = { id: "u_owner", name: "בעלים", role: "parent" };
    const out = await html(await BookPage({ params: params({ slug: "secret" }) }));
    expect(out).toContain(SECRET_TITLE);
    expect(out).toContain("זה ספר פרטי");
    expect(out).not.toContain("application/ld+json");
    const meta = await bookMetadata({ params: params({ slug: "secret" }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("shows the favorite state of the signed-in reader", async () => {
    state.user = { id: "u_reader", name: "קוראת", role: "parent" };
    await data.repo.upsertUser({ id: "u_reader", name: "קוראת" });
    await data.repo.addFavorite("u_reader", "pub-snail");
    const out = await html(await BookPage({ params: params({ slug: "snail" }) }));
    expect(out).toContain("במועדפים שלי");
    expect(out).toContain('aria-pressed="true"');
  });

  it("builds metadata", async () => {
    const meta = await bookMetadata({ params: params({ slug: "snail" }) });
    expect(meta.title).toBe("השבלול");
    expect(meta.alternates?.canonical).toBe("/book/snail");
    expect(meta.robots).toBeUndefined();
    expect((await booksMetadata({ searchParams: params({}) })).robots).toBeUndefined();
    expect((await booksMetadata({ searchParams: params({ age: "3-5" }) })).robots).toEqual({ index: false, follow: true });
    expect((await searchMetadata({ searchParams: params({ q: "שבלול" }) })).title).toBe("חיפוש: שבלול");
  });
});
