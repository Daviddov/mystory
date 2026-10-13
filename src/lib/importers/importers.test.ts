import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import { CcCreditSchema } from "./cc";
import { createDraftFromPages, PagesImportError, PagesImportMetaSchema } from "./create-from-pages";
import { checkMediaFile, detectAudioType, detectImageType } from "./media-sniff";
import { naturalCompare, sortByNaturalPath } from "./natural-sort";
import { textFromPdfItems } from "./pdf-text";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("natural filename order", () => {
  it("orders numbers by value", () => {
    const names = ["page10.png", "page2.png", "Page1.png", "page-3.png", "page02b.png"];
    expect([...names].sort(naturalCompare)).toEqual([
      "page-3.png",
      "Page1.png",
      "page2.png",
      "page02b.png",
      "page10.png",
    ]);
    expect(["10.jpg", "9.jpg", "1.jpg", "100.jpg"].sort(naturalCompare)).toEqual([
      "1.jpg",
      "9.jpg",
      "10.jpg",
      "100.jpg",
    ]);
  });

  it("orders folder by folder, files before sub-folders", () => {
    const paths = ["book/ch2/1.png", "book/ch10/1.png", "book/ch2/10.png", "book/ch2/2.png", "book/cover.png"];
    expect(sortByNaturalPath(paths, (item) => item)).toEqual([
      "book/cover.png",
      "book/ch2/1.png",
      "book/ch2/2.png",
      "book/ch2/10.png",
      "book/ch10/1.png",
    ]);
  });
});

describe("media sniffing", () => {
  it("recognises images by content", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(ascii("GIF89a..."))).toBe("image/gif");
    expect(detectImageType(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectImageType(ascii('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      "image/svg+xml",
    );
    expect(detectImageType(ascii("<html><svg></svg></html>"))).toBeNull();
    expect(detectImageType(ascii("MZ\u0090\0"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it("recognises audio by content", () => {
    expect(detectAudioType(ascii("RIFF\0\0\0\0WAVEfmt "))).toBe("audio/wav");
    expect(detectAudioType(ascii("OggS\0"))).toBe("audio/ogg");
    expect(detectAudioType(ascii("ID3\u0004"))).toBe("audio/mpeg");
    expect(detectAudioType(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBe("audio/mpeg");
    expect(detectAudioType(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe("audio/aac");
    expect(detectAudioType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe("audio/webm");
    expect(detectAudioType(PNG)).toBeNull();
  });

  it("requires the extension and the content to agree", () => {
    expect(checkMediaFile("image", "a.PNG", PNG)).toEqual({ ok: true, contentType: "image/png" });
    expect(checkMediaFile("image", "a.jpg", PNG)).toEqual({ ok: false, reason: "content" });
    expect(checkMediaFile("image", "a.exe", PNG)).toEqual({ ok: false, reason: "extension" });
    expect(checkMediaFile("audio", "a.png", PNG)).toEqual({ ok: false, reason: "extension" });
  });
});

describe("PDF text layer", () => {
  const item = (str: string, y: number, hasEOL = false) => ({ str, hasEOL, transform: [1, 0, 0, 1, 0, y], height: 12 });

  it("joins wrapped lines and keeps paragraph breaks", () => {
    const items = [
      item("היה היה", 700),
      item(" ", 700),
      item("שבלול קטן", 700, true),
      item("שגר בגינה.", 686, true),
      item("", 686, true),
      item("יום אחד ירד גשם.", 640),
    ];
    expect(textFromPdfItems(items)).toBe("היה היה שבלול קטן שגר בגינה.\nיום אחד ירד גשם.");
  });

  it("starts a new line when the position changes without an end-of-line flag", () => {
    expect(textFromPdfItems([item("שורה אחת", 500), item("שורה שתיים", 486)])).toBe("שורה אחת שורה שתיים");
  });

  it("ignores marked-content items and empty pages", () => {
    expect(textFromPdfItems([{ transform: [1, 0, 0, 1, 0, 0] }, { str: "  " }])).toBe("");
    expect(textFromPdfItems([])).toBe("");
  });

  // Pointed Hebrew as Chrome's PDF writer stores it: one item per glyph, from
  // left to right, each point just before its letter. Taken from a real export.
  describe("pointed Hebrew placed glyph by glyph", () => {
    const glyph = (str: string, x: number, width: number, dir = "rtl", y = 100) => ({
      str,
      dir,
      width,
      height: width === 0 && str.trim() === "" ? 0 : 24,
      transform: [1, 0, 0, 1, x, y],
      hasEOL: false,
    });

    it("restores the reading order and puts every point after its letter", () => {
      // "לֹא בְּיוֹם" drawn from the left: ם ֹ ו י ְּ ב, a space, א ֹ ל.
      const items = [
        glyph("ם", 701, 20),
        glyph("ֹ", 748, 0),
        glyph("ו", 744, 15),
        glyph("י", 759, 15),
        glyph("ְּ", 783, 0),
        glyph("ב", 774, 26),
        glyph(" ", 800, 15, "ltr"),
        glyph("א", 811, 30),
        glyph("ֹ", 833, 0),
        glyph("ל", 841, 25),
      ];
      expect(textFromPdfItems(items)).toBe("לֹא בְּיוֹם".normalize("NFC"));
    });

    it("keeps the point of a word's last letter on that word and drops zero-width spaces", () => {
      // "הוּ יִגַּע": the point of the last letter arrives before the space, glued to a space of its own.
      const items = [
        glyph("ע", 564, 15),
        glyph("ַּ", 580, 0),
        glyph(" ", 579, 0, "ltr"),
        glyph("ג", 579, 10),
        glyph("ִ", 591, 0),
        glyph(" ", 589, 0, "ltr"),
        glyph("י", 589, 8),
        glyph("ּ ", 602, 0),
        glyph(" ", 596, 9, "ltr"),
        glyph("ו", 603, 8),
        glyph("ה", 611, 16),
      ];
      expect(textFromPdfItems(items)).toBe("הוּ יִגַּע".normalize("NFC"));
    });

    it("puts closing punctuation after the last letter", () => {
      // `קְצָת..."`: pdf.js reports the quote, the dots and the last letter as one left-to-right item.
      const items = [
        glyph('"...ת', 289.7, 46.7, "ltr"),
        glyph("ָ", 340, 0),
        glyph("צ", 336, 16),
        glyph("ְ", 358, 0),
        glyph("ק", 352, 18),
      ];
      expect(textFromPdfItems(items)).toBe('קְצָת..."'.normalize("NFC"));
    });

    it("keeps numbers readable inside a Hebrew line", () => {
      const items = [glyph("ם", 100, 20), glyph("י", 120, 8), glyph(" ", 128, 9, "ltr"), glyph("20", 137, 30, "ltr")];
      expect(textFromPdfItems(items)).toBe("20 ים");
    });

    it("starts a new paragraph when the font size changes", () => {
      const title = { str: "כותרת", height: 44, transform: [1, 0, 0, 1, 100, 300], hasEOL: true };
      const body = { str: "שורת טקסט", height: 16, transform: [1, 0, 0, 1, 100, 250] };
      expect(textFromPdfItems([title, body])).toBe("כותרת\nשורת טקסט");
    });
  });
});

describe("Creative Commons credit", () => {
  const valid = { license: "CC BY 4.0", sourceUrl: "https://bookdash.org/books/x", author: "Jane Writer" };

  it("requires license, source URL and attribution", () => {
    expect(CcCreditSchema.parse(valid)).toEqual({ ...valid, illustrator: "" });
    expect(CcCreditSchema.safeParse({ ...valid, license: "All rights reserved" }).success).toBe(false);
    expect(CcCreditSchema.safeParse({ ...valid, license: "" }).success).toBe(false);
    expect(CcCreditSchema.safeParse({ ...valid, sourceUrl: "bookdash.org" }).success).toBe(false);
    expect(CcCreditSchema.safeParse({ ...valid, sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(CcCreditSchema.safeParse({ ...valid, author: "   " }).success).toBe(false);
  });

  it("is mandatory for the Creative Commons import kind", () => {
    expect(PagesImportMetaSchema.safeParse({ title: "ספר", kind: "cc", pages: [] }).success).toBe(false);
    expect(PagesImportMetaSchema.safeParse({ title: "ספר", kind: "cc", pages: [], credit: valid }).success).toBe(true);
    expect(PagesImportMetaSchema.safeParse({ title: "ספר", kind: "images", pages: [] }).success).toBe(true);
  });
});

describe("createDraftFromPages", () => {
  let data: TempData;

  beforeEach(async () => {
    data = await createTempData();
  });

  afterEach(async () => {
    await data.cleanup();
  });

  it("creates a draft with one page per image and stores the credit", async () => {
    const meta = PagesImportMetaSchema.parse({
      title: "  ספר מיובא  ",
      kind: "images",
      pages: [
        { text: "עמוד  ראשון\r\n\r\n\r\n\r\nהמשך ", hasImage: true },
        { text: "", hasImage: true },
      ],
      credit: {
        license: "CC BY-SA 4.0",
        sourceUrl: "https://storyweaver.org.in/stories/1",
        author: "A. Author",
        illustrator: "I. Llustrator",
      },
    });
    const book = await createDraftFromPages({
      ownerId: "u_7",
      meta,
      images: [PNG, JPEG],
      repo: data.repo,
      media: data.media,
    });

    expect(book).toMatchObject({
      title: "ספר מיובא",
      ownerId: "u_7",
      status: "draft",
      origin: "import",
      license: "CC BY-SA 4.0",
      source: "https://storyweaver.org.in/stories/1",
      author: "A. Author",
      illustrator: "I. Llustrator",
      coverImage: `books/${book.id}/cover.png`,
    });
    expect(book.pages).toEqual([
      { index: 0, text: "עמוד ראשון\n\nהמשך", image: `books/${book.id}/page-01.png` },
      { index: 1, text: "", image: `books/${book.id}/page-02.jpg` },
    ]);
    expect(await data.media.list(`books/${book.id}`)).toEqual(
      ["cover.png", "page-01.png", "page-02.jpg"].map((name) => `books/${book.id}/${name}`),
    );
  });

  it("creates a Creative Commons draft without pages", async () => {
    const meta = PagesImportMetaSchema.parse({
      title: "ספר חופשי",
      kind: "cc",
      pages: [],
      credit: { license: "CC BY 4.0", sourceUrl: "https://bookdash.org/x", author: "Someone" },
    });
    const book = await createDraftFromPages({ ownerId: "u_7", meta, images: [], repo: data.repo, media: data.media });
    expect(book).toMatchObject({ status: "draft", license: "CC BY 4.0", coverImage: "", pages: [] });
  });

  it("refuses files that are not images and stores nothing", async () => {
    const meta = PagesImportMetaSchema.parse({
      title: "ספר",
      kind: "images",
      pages: [
        { text: "", hasImage: true },
        { text: "", hasImage: true },
      ],
    });
    await expect(
      createDraftFromPages({ ownerId: "u", meta, images: [PNG, ascii("<html>")], repo: data.repo, media: data.media }),
    ).rejects.toMatchObject({ code: "image-type" });
    await expect(
      createDraftFromPages({ ownerId: "u", meta, images: [PNG], repo: data.repo, media: data.media }),
    ).rejects.toBeInstanceOf(PagesImportError);
    expect((await data.repo.listBooks({ status: "any" })).total).toBe(0);
    expect(await data.media.list("books")).toEqual([]);
  });
});
