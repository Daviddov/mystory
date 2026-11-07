import { describe, expect, it } from "vitest";
import { englishPath, hasEnglishPage, hebrewPath, localizedPath, stripEnglishPrefix } from "./paths";

describe("English addresses", () => {
  it("knows which pages have an English twin", () => {
    for (const path of ["/", "/books", "/book/snail", "/parasha/bereshit", "/about", "/faq", "/books?page=2", "/tag/%D7%92"]) {
      expect(hasEnglishPage(path), path).toBe(true);
    }
    for (const path of ["/read/snail", "/studio", "/login", "/search?q=x", "/api/pdf/x", "/book", "/en/books", "books"]) {
      expect(hasEnglishPage(path), path).toBe(false);
    }
  });

  it("builds and reads /en addresses", () => {
    expect(englishPath("/")).toBe("/en");
    expect(englishPath("/books?page=2")).toBe("/en/books?page=2");
    expect(stripEnglishPrefix("/en")).toBe("/");
    expect(stripEnglishPrefix("/en/book/x")).toBe("/book/x");
    expect(stripEnglishPrefix("/english")).toBeNull();
    expect(hebrewPath("/en/books?page=2")).toBe("/books?page=2");
    expect(hebrewPath("/en")).toBe("/");
    expect(hebrewPath("/books")).toBe("/books");
  });

  it("moves only pages with an English twin to /en, and only in English", () => {
    expect(localizedPath("/book/x", "en")).toBe("/en/book/x");
    expect(localizedPath("/", "en")).toBe("/en");
    expect(localizedPath("/read/x?page=2", "en")).toBe("/read/x?page=2");
    expect(localizedPath("/book/x", "he")).toBe("/book/x");
  });
});
