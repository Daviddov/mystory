import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { BookWithPages } from "@/lib/types";
import { baseDirection, bidiRuns } from "./bidi";
import { buildBookPdf, type PdfRasterImage } from "./book-pdf";
import { loadPdfFonts, type LoadedFonts, type PdfFontKey } from "./fonts";
import { rasterizeForPdf } from "./images";
import { bookHasNikud, creditLines, printablePages } from "./printable";
import { fitText, layoutLine, wrapText, type FontPair } from "./text";
import { isWoff, woffToSfnt } from "./woff";

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "frank-ruhl-libre", "files");

function makeBook(overrides: Partial<BookWithPages> = {}): BookWithPages {
  return {
    id: "bk_pdf",
    slug: "pdf-book",
    title: "הכוכב הקטן",
    summary: "סיפור קצר לבדיקה.",
    author: "מחברת",
    illustrator: "מאייר",
    license: "CC BY 4.0",
    source: "נכתב לבדיקה",
    ageGroup: "0-2",
    readingMinutes: 2,
    coverImage: "",
    status: "published",
    ownerId: "system",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: ["מה ראינו בסיפור?"],
    origin: "manual",
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { index: 0, text: "לילה טוב, ירח.", textNikud: "לַיְלָה טוֹב, יָרֵחַ." },
      { index: 1, text: "יש לי 3 בלונים." },
    ],
    ...overrides,
  };
}

describe("woffToSfnt", () => {
  it("unpacks a WOFF file into a TrueType font with a sorted table directory", async () => {
    const woff = new Uint8Array(await readFile(path.join(FONT_DIR, "frank-ruhl-libre-hebrew-400-normal.woff")));
    expect(isWoff(woff)).toBe(true);
    const sfnt = woffToSfnt(woff);
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    expect(view.getUint32(0)).toBe(0x00010000);
    const numTables = view.getUint16(4);
    expect(numTables).toBeGreaterThan(8);
    const tags: number[] = [];
    for (let i = 0; i < numTables; i++) {
      const at = 12 + i * 16;
      tags.push(view.getUint32(at));
      // Every table lies inside the file.
      expect(view.getUint32(at + 8) + view.getUint32(at + 12)).toBeLessThanOrEqual(sfnt.length);
    }
    expect([...tags].sort((a, b) => a - b)).toEqual(tags);
  });

  it("returns non-WOFF bytes unchanged and rejects a truncated file", async () => {
    const plain = new Uint8Array([0, 1, 0, 0, 0, 0]);
    expect(woffToSfnt(plain)).toBe(plain);
    const woff = new Uint8Array(await readFile(path.join(FONT_DIR, "frank-ruhl-libre-hebrew-400-normal.woff")));
    expect(() => woffToSfnt(woff.slice(0, 400))).toThrow();
  });
});

describe("bidiRuns", () => {
  const visual = (text: string) => bidiRuns(text).map((run) => `${run.direction}:${run.text}`);

  it("keeps pure Hebrew as one rtl run", () => {
    expect(visual("שלום לך, ילד.")).toEqual(["rtl:שלום לך, ילד."]);
  });

  it("places a number to the left of the Hebrew that precedes it", () => {
    // Logical: "יש 3 בלונים". Visual, left to right: "בלונים " | "3" | "יש ".
    expect(visual("יש 3 בלונים")).toEqual(["rtl: בלונים", "ltr:3", "rtl:יש "]);
  });

  it("keeps a decimal number and a Latin word in reading order", () => {
    expect(visual("מחיר 12.5 שקלים")).toEqual(["rtl: שקלים", "ltr:12.5", "rtl:מחיר "]);
    expect(visual("המילה Hello World כאן")).toEqual(["rtl: כאן", "ltr:Hello World", "rtl:המילה "]);
  });

  it("mirrors brackets inside rtl text", () => {
    expect(visual("(אב)")).toEqual(["rtl:)אב("]);
  });

  it("keeps vowel points with their letters", () => {
    const runs = bidiRuns("לַיְלָה 5");
    expect(runs.map((run) => run.direction)).toEqual(["ltr", "rtl"]);
    expect(runs[1].text).toBe("לַיְלָה ");
  });

  it("uses the first strong character as the base direction", () => {
    expect(baseDirection("Hello שלום")).toBe("ltr");
    expect(baseDirection("3. שאלה")).toBe("rtl");
    expect(baseDirection("123")).toBe("rtl");
    expect(visual("CC BY 4.0")).toEqual(["ltr:CC BY 4.0"]);
  });
});

describe("text layout with the real fonts", () => {
  let fonts: LoadedFonts;
  let pair: FontPair<PdfFontKey>;

  beforeAll(async () => {
    fonts = await loadPdfFonts();
    pair = {
      hebrew: { key: "regular-hebrew", font: fonts["regular-hebrew"].font },
      latin: { key: "regular-latin", font: fonts["regular-latin"].font },
    };
  });

  it("lays Hebrew glyphs out right to left", () => {
    const layout = layoutLine("אב", pair);
    const alef = fonts["regular-hebrew"].font.layout("א").glyphs[0].id;
    const bet = fonts["regular-hebrew"].font.layout("ב").glyphs[0].id;
    const glyphs = layout.segments.flatMap((segment) => segment.glyphs);
    expect(glyphs.map((glyph) => glyph.id)).toEqual([bet, alef]);
    expect(glyphs[0].x).toBeLessThan(glyphs[1].x);
    expect(layout.dropped).toEqual([]);
  });

  it("positions vowel points with offsets and does not let them widen the word", () => {
    const plain = layoutLine("הכוכב", pair);
    const pointed = layoutLine("הַכּוֹכָב", pair);
    expect(pointed.width).toBeCloseTo(plain.width, 5);
    const glyphs = pointed.segments.flatMap((segment) => segment.glyphs);
    expect(glyphs).toHaveLength(9);
    // Marks have no advance of their own; at least one is shifted off the pen position.
    const marks = glyphs.filter((glyph) => glyph.advance === 0);
    expect(marks).toHaveLength(4);
    expect(new Set(glyphs.map((glyph) => glyph.x.toFixed(4))).size).toBeGreaterThan(5);
  });

  it("takes punctuation and digits from the Latin file", () => {
    const layout = layoutLine("יש 3 בלונים!", pair);
    expect(new Set(layout.segments.map((segment) => segment.fontKey))).toEqual(new Set(["regular-hebrew", "regular-latin"]));
    expect(layout.dropped).toEqual([]);
  });

  it("reports characters no font can draw instead of failing", () => {
    const layout = layoutLine("שלום 🌙", pair);
    expect(layout.dropped).toEqual(["🌙"]);
    expect(layout.width).toBeGreaterThan(0);
  });

  it("wraps on words, keeps explicit line breaks and fits a box", () => {
    const text = "אחת שתיים שלוש ארבע חמש שש שבע שמונה";
    const lines = wrapText(text, pair, 8);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);
    expect(wrapText("אחת\n\nשתיים", pair, 50)).toEqual(["אחת", "", "שתיים"]);

    const roomy = fitText(text, pair, { width: 400, height: 300 }, { maxSize: 30, minSize: 12, leading: 1.5 });
    expect(roomy.overflow).toBe(false);
    expect(roomy.fontSize).toBe(30);
    const tight = fitText(text, pair, { width: 60, height: 30 }, { maxSize: 30, minSize: 12, leading: 1.5 });
    expect(tight.overflow).toBe(true);
    expect(tight.fontSize).toBe(12);
  });
});

describe("printable helpers", () => {
  it("uses vocalized text only when asked and only where it exists", () => {
    const book = makeBook();
    expect(bookHasNikud(book)).toBe(true);
    expect(printablePages(book, false).map((page) => page.text)).toEqual(["לילה טוב, ירח.", "יש לי 3 בלונים."]);
    expect(printablePages(book, true).map((page) => page.text)).toEqual(["לַיְלָה טוֹב, יָרֵחַ.", "יש לי 3 בלונים."]);
    expect(bookHasNikud(makeBook({ pages: [{ index: 0, text: "שלום" }] }))).toBe(false);
  });

  it("leaves empty credit fields out", () => {
    expect(creditLines(makeBook({ illustrator: "", source: " " })).map((line) => line.label)).toEqual(["כתיבה", "רישיון"]);
  });
});

describe("buildBookPdf", () => {
  const noImages = async (): Promise<PdfRasterImage | null> => null;

  it("creates a cover sheet, one sheet per page and a closing sheet", async () => {
    const result = await buildBookPdf(makeBook(), { loadImage: noImages, siteName: "הסיפור שלי", nikud: true });
    expect(new TextDecoder("latin1").decode(result.bytes.slice(0, 5))).toBe("%PDF-");
    expect(result.sheets).toBe(4);
    expect(result.missingImages).toEqual([]);
    expect(result.droppedCharacters).toEqual([]);

    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBe("הכוכב הקטן");
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it("embeds illustrations and reports the ones it could not get", async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect width="800" height="600" fill="#1B2350"/></svg>',
    );
    const raster = await rasterizeForPdf(svg, "image/svg+xml");
    expect(raster).not.toBeNull();
    expect(raster?.format).toBe("jpeg");

    const book = makeBook({
      coverImage: "books/bk_pdf/cover.svg",
      pages: [
        { index: 0, text: "עמוד עם איור.", image: "books/bk_pdf/page-1.svg" },
        { index: 1, text: "עמוד שהאיור שלו חסר.", image: "books/bk_pdf/missing.svg" },
      ],
    });
    const result = await buildBookPdf(book, {
      siteName: "הסיפור שלי",
      loadImage: async (mediaPath) => (mediaPath.endsWith("missing.svg") ? null : raster),
    });
    expect(result.sheets).toBe(4);
    expect(result.missingImages).toEqual(["books/bk_pdf/missing.svg"]);
  });

  it("moves text that does not fit to continuation sheets instead of cutting it", async () => {
    const long = Array.from({ length: 900 }, (_, i) => `מילה${i}`).join(" ");
    const result = await buildBookPdf(makeBook({ pages: [{ index: 0, text: long }] }), {
      loadImage: noImages,
      siteName: "הסיפור שלי",
    });
    expect(result.sheets).toBeGreaterThan(3);
  });

  it("survives a loader that throws", async () => {
    const book = makeBook({ pages: [{ index: 0, text: "שלום", image: "books/bk_pdf/p.png" }] });
    const result = await buildBookPdf(book, {
      siteName: "הסיפור שלי",
      loadImage: async () => {
        throw new Error("storage is down");
      },
    });
    expect(result.missingImages).toEqual(["books/bk_pdf/p.png"]);
    expect(result.sheets).toBe(3);
  });
});
