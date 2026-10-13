/**
 * Builds the printable PDF of a book with pdf-lib: A4 landscape, one spread
 * per sheet (illustration on the right, text on the left, as in a Hebrew
 * book), a cover sheet first and a closing sheet with discussion questions
 * and credits.
 *
 * Text is placed glyph by glyph from the layout in text.ts, because pdf-lib's
 * drawText() loses nikud positioning and has no bidi support.
 *
 * No "server-only" import here: the module only needs Node, so tests and
 * scripts can call it directly. Route handlers go through ./index.ts.
 */
import {
  PDFDocument,
  PDFHexString,
  ReadingDirection,
  beginText,
  endText,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  showText,
  type PDFFont,
  type PDFImage,
  type PDFName,
  type PDFOperator,
  type PDFPage,
} from "pdf-lib";
import { ageGroupLabel, readingTimeLabel } from "../taxonomy";
import type { BookWithPages } from "../types";
import { baseDirection } from "./bidi";
import { fontkit, loadPdfFonts, PDF_FONT_KEYS, type LoadedFonts, type PdfFontKey } from "./fonts";
import { creditLines, printablePages } from "./printable";
import { fitText, layoutLine, wrapText, type FontPair, type LineLayout } from "./text";

/** A raster image pdf-lib can embed. SVG and other formats must be converted first (see images.ts). */
export interface PdfRasterImage {
  bytes: Uint8Array;
  format: "png" | "jpeg";
}

export interface BuildBookPdfOptions {
  /** Use the vocalized text of pages that have one. */
  nikud?: boolean;
  /** Returns the illustration at a media path as PNG or JPEG, or null when it cannot be provided. */
  loadImage: (mediaPath: string) => Promise<PdfRasterImage | null>;
  /** Printed on the cover and in the footer of every sheet. */
  siteName: string;
  /** Absolute link to the book, printed in the credits. */
  bookUrl?: string;
  /** Override the fonts (tests). Defaults to loadPdfFonts(). */
  fonts?: LoadedFonts;
}

export interface BookPdfResult {
  bytes: Uint8Array;
  /** Number of sheets in the file. */
  sheets: number;
  /** Media paths of illustrations that could not be embedded; a placeholder box was drawn instead. */
  missingImages: string[];
  /** Characters no font could draw (for example emoji); they were left out. */
  droppedCharacters: string[];
}

// A4 landscape, in points.
const SHEET_WIDTH = 841.89;
const SHEET_HEIGHT = 595.28;
const MARGIN = 40;
const GUTTER = 32;
const FOOTER_HEIGHT = 24;
/** Distance from the top of a line box to the baseline, in em. */
const ASCENT_EM = 0.82;

type Rgb = readonly [number, number, number];
const INK: Rgb = [0.23, 0.18, 0.16];
const MUTED: Rgb = [0.44, 0.38, 0.33];
const PAPER_TINT: Rgb = [0.99, 0.94, 0.85];
const RULE: Rgb = [0.79, 0.69, 0.58];

type Align = "start" | "center";

interface Box {
  x: number;
  y: number; // bottom edge
  width: number;
  height: number;
}

class Writer {
  private readonly fontNames = new Map<PDFPage, Map<PdfFontKey, PDFName>>();
  readonly dropped = new Set<string>();

  constructor(
    private readonly pdfFonts: Record<PdfFontKey, PDFFont>,
    readonly regular: FontPair<PdfFontKey>,
    readonly bold: FontPair<PdfFontKey>,
  ) {}

  private fontName(page: PDFPage, key: PdfFontKey): PDFName {
    let names = this.fontNames.get(page);
    if (!names) {
      names = new Map();
      this.fontNames.set(page, names);
    }
    let name = names.get(key);
    if (!name) {
      const font = this.pdfFonts[key];
      name = page.node.newFontDictionary(font.name, font.ref);
      names.set(key, name);
    }
    return name;
  }

  layout(line: string, pair: FontPair<PdfFontKey>): LineLayout<PdfFontKey> {
    const result = layoutLine(line, pair);
    for (const ch of result.dropped) this.dropped.add(ch);
    return result;
  }

  /** Draw one shaped line with its left edge at `x` and its baseline at `y`. */
  drawLayout(page: PDFPage, layout: LineLayout<PdfFontKey>, x: number, y: number, size: number, color: Rgb): void {
    const ops: PDFOperator[] = [beginText(), setFillingRgbColor(color[0], color[1], color[2])];
    for (const segment of layout.segments) {
      ops.push(setFontAndSize(this.fontName(page, segment.fontKey), size));
      // Glyphs that simply follow each other share one string; a glyph with an
      // offset (a vowel point) or a kerned advance starts a new positioned string.
      let hex = "";
      let expectedX = Number.NaN;
      const flush = () => {
        if (hex) ops.push(showText(PDFHexString.of(hex)));
        hex = "";
      };
      for (const glyph of segment.glyphs) {
        const continues = hex !== "" && glyph.y === 0 && Math.abs(glyph.x - expectedX) < 1e-6;
        if (!continues) {
          flush();
          ops.push(setTextMatrix(1, 0, 0, 1, round(x + glyph.x * size), round(y + glyph.y * size)));
        }
        hex += glyph.id.toString(16).padStart(4, "0");
        expectedX = glyph.y === 0 ? glyph.x + glyph.advance : Number.NaN;
      }
      flush();
    }
    ops.push(endText());
    page.pushOperators(...ops);
  }

  /**
   * Draw lines downwards from `top`. 'start' aligns each line to the side its
   * text starts on (right for Hebrew). Returns the y just below the last line.
   */
  drawLines(
    page: PDFPage,
    lines: string[],
    pair: FontPair<PdfFontKey>,
    opts: { x: number; width: number; top: number; size: number; lineHeight: number; align: Align; color?: Rgb },
  ): number {
    lines.forEach((line, i) => {
      if (line === "") return;
      const layout = this.layout(line, pair);
      const lineWidth = layout.width * opts.size;
      let x: number;
      if (opts.align === "center") x = opts.x + (opts.width - lineWidth) / 2;
      else x = baseDirection(line) === "rtl" ? opts.x + opts.width - lineWidth : opts.x;
      const y = opts.top - i * opts.lineHeight - ASCENT_EM * opts.size;
      this.drawLayout(page, layout, x, y, opts.size, opts.color ?? INK);
    });
    return opts.top - lines.length * opts.lineHeight;
  }

  /** Wrap and draw a paragraph at a fixed size. Returns the y just below it. */
  drawParagraph(
    page: PDFPage,
    text: string,
    pair: FontPair<PdfFontKey>,
    opts: { x: number; width: number; top: number; size: number; leading?: number; align?: Align; color?: Rgb },
  ): number {
    const lines = wrapText(text, pair, opts.width / opts.size);
    return this.drawLines(page, lines, pair, {
      ...opts,
      lineHeight: opts.size * (opts.leading ?? 1.5),
      align: opts.align ?? "start",
    });
  }
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

function containRect(box: Box, imageWidth: number, imageHeight: number): Box {
  const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

function drawRect(page: PDFPage, box: Box, fill: Rgb, border?: Rgb): void {
  const [r, g, b] = fill;
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: rgb(r, g, b),
    ...(border ? { borderColor: rgb(border[0], border[1], border[2]), borderWidth: 1 } : {}),
  });
}

export async function buildBookPdf(book: BookWithPages, options: BuildBookPdfOptions): Promise<BookPdfResult> {
  const fonts = options.fonts ?? (await loadPdfFonts());
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as never);

  const pdfFonts = {} as Record<PdfFontKey, PDFFont>;
  for (const key of PDF_FONT_KEYS) {
    // No subsetting: the glyph ids written to the page must be the ids of the
    // embedded font, and each subset file is only a few dozen kilobytes.
    pdfFonts[key] = await doc.embedFont(fonts[key].bytes, { subset: false });
  }
  const face = (key: PdfFontKey) => ({ key, font: fonts[key].font });
  const writer = new Writer(
    pdfFonts,
    { hebrew: face("regular-hebrew"), latin: face("regular-latin") },
    { hebrew: face("bold-hebrew"), latin: face("bold-latin") },
  );

  doc.setTitle(book.title);
  if (book.author) doc.setAuthor(book.author);
  doc.setLanguage("he");
  doc.setCreator(options.siteName);
  doc.setProducer(options.siteName);
  doc.catalog.getOrCreateViewerPreferences().setReadingDirection(ReadingDirection.R2L);

  const missingImages: string[] = [];
  const embedImage = async (mediaPath: string | undefined): Promise<PDFImage | null> => {
    if (!mediaPath) return null;
    try {
      const image = await options.loadImage(mediaPath);
      if (!image) {
        missingImages.push(mediaPath);
        return null;
      }
      return image.format === "png" ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
    } catch (err) {
      console.warn(`[pdf] could not embed illustration ${mediaPath}`, err);
      missingImages.push(mediaPath);
      return null;
    }
  };

  const drawIllustration = (page: PDFPage, image: PDFImage | null, box: Box, aspect: readonly [number, number]) => {
    if (image) {
      page.drawImage(image, containRect(box, image.width, image.height));
      return;
    }
    // Never leave a silent hole: say that the picture is missing.
    const frame = containRect(box, aspect[0], aspect[1]);
    drawRect(page, frame, PAPER_TINT, RULE);
    writer.drawParagraph(page, "האיור לא זמין בקובץ ההדפסה", writer.regular, {
      x: frame.x + 16,
      width: frame.width - 32,
      top: frame.y + frame.height / 2 + 10,
      size: 14,
      align: "center",
      color: MUTED,
    });
  };

  const drawFooter = (page: PDFPage, label: string) => {
    writer.drawLines(page, [label], writer.regular, {
      x: MARGIN,
      width: SHEET_WIDTH - 2 * MARGIN,
      top: MARGIN - 6 + 11,
      size: 10,
      lineHeight: 12,
      align: "center",
      color: MUTED,
    });
  };

  const contentTop = SHEET_HEIGHT - MARGIN;
  const contentBottom = MARGIN + FOOTER_HEIGHT;
  const contentHeight = contentTop - contentBottom;

  // --- Cover sheet ------------------------------------------------------------
  {
    const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
    const cover = await embedImage(book.coverImage || undefined);
    const hasCover = book.coverImage !== "";
    const coverBox: Box = { x: SHEET_WIDTH - MARGIN - 345, y: contentBottom, width: 345, height: contentHeight };
    const column: Box = hasCover
      ? { x: MARGIN, y: contentBottom, width: coverBox.x - GUTTER - MARGIN, height: contentHeight }
      : { x: MARGIN + 80, y: contentBottom, width: SHEET_WIDTH - 2 * MARGIN - 160, height: contentHeight };
    if (hasCover) drawIllustration(page, cover, coverBox, [3, 4]);

    const title = fitText(book.title, writer.bold, { width: column.width, height: 190 }, { maxSize: 44, minSize: 20, leading: 1.35 });
    const details: string[] = [];
    if (book.author) details.push(`מאת ${book.author}`);
    if (book.illustrator && book.illustrator !== book.author) details.push(`איורים: ${book.illustrator}`);
    const meta = `${ageGroupLabel(book.ageGroup)}, ${readingTimeLabel(book.readingMinutes)} קריאה`;

    let y = contentTop - 30;
    y = writer.drawLines(page, title.lines, writer.bold, {
      x: column.x,
      width: column.width,
      top: y,
      size: title.fontSize,
      lineHeight: title.lineHeight,
      align: "center",
    });
    y -= 14;
    for (const line of details) {
      y = writer.drawParagraph(page, line, writer.regular, { x: column.x, width: column.width, top: y, size: 16, align: "center" });
    }
    y -= 6;
    y = writer.drawParagraph(page, meta, writer.regular, {
      x: column.x,
      width: column.width,
      top: y,
      size: 13,
      align: "center",
      color: MUTED,
    });
    if (book.summary) {
      y -= 22;
      const room = Math.max(40, y - contentBottom);
      const summary = fitText(book.summary, writer.regular, { width: column.width, height: room }, { maxSize: 15, minSize: 9, leading: 1.6 });
      const maxLines = Math.max(1, Math.floor(room / summary.lineHeight));
      writer.drawLines(page, summary.lines.slice(0, maxLines), writer.regular, {
        x: column.x,
        width: column.width,
        top: y,
        size: summary.fontSize,
        lineHeight: summary.lineHeight,
        align: summary.lines.length <= 2 ? "center" : "start",
      });
    }
    drawFooter(page, options.siteName);
  }

  // --- Story sheets -----------------------------------------------------------
  const pages = printablePages(book, options.nikud === true);
  const maxSize = book.ageGroup === "0-2" ? 36 : book.ageGroup === "3-5" ? 28 : 24;
  for (const storyPage of pages) {
    const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
    const hasImage = !!storyPage.image;
    const image = await embedImage(storyPage.image);

    // Right half: the illustration (4:3). Left half: the text.
    const imageBox: Box = { x: SHEET_WIDTH - MARGIN - 440, y: contentBottom, width: 440, height: contentHeight };
    const textBox: Box = hasImage
      ? { x: MARGIN, y: contentBottom, width: imageBox.x - GUTTER - MARGIN, height: contentHeight }
      : { x: MARGIN + 90, y: contentBottom, width: SHEET_WIDTH - 2 * MARGIN - 180, height: contentHeight };
    if (hasImage) drawIllustration(page, image, imageBox, [4, 3]);

    const fitted = fitText(storyPage.text, writer.regular, textBox, { maxSize, minSize: 12, leading: 1.75 });
    const perSheet = Math.max(1, Math.floor(textBox.height / fitted.lineHeight));
    const align: Align = fitted.lines.length <= 3 ? "center" : "start";

    const first = fitted.lines.slice(0, perSheet);
    const blockHeight = first.length * fitted.lineHeight;
    writer.drawLines(page, first, writer.regular, {
      x: textBox.x,
      width: textBox.width,
      top: textBox.y + (textBox.height + blockHeight) / 2,
      size: fitted.fontSize,
      lineHeight: fitted.lineHeight,
      align,
    });
    drawFooter(page, String(storyPage.number));

    // Very long text continues on text-only sheets instead of being cut off.
    const fullWidth: Box = { x: MARGIN + 90, y: contentBottom, width: SHEET_WIDTH - 2 * MARGIN - 180, height: contentHeight };
    let rest = fitted.lines.slice(perSheet).join(" ");
    while (rest.trim() !== "") {
      const extra = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
      const lines = wrapText(rest, writer.regular, fullWidth.width / fitted.fontSize);
      const chunk = lines.slice(0, perSheet);
      writer.drawLines(extra, chunk, writer.regular, {
        x: fullWidth.x,
        width: fullWidth.width,
        top: contentTop,
        size: fitted.fontSize,
        lineHeight: fitted.lineHeight,
        align: "start",
      });
      drawFooter(extra, String(storyPage.number));
      rest = lines.slice(perSheet).join(" ");
    }
  }

  // --- Closing sheet: discussion questions and credits -------------------------
  {
    const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
    const column: Box = { x: MARGIN + 110, y: contentBottom, width: SHEET_WIDTH - 2 * MARGIN - 220, height: contentHeight };
    let y = contentTop - 10;
    y = writer.drawParagraph(page, "הסוף", writer.bold, { x: column.x, width: column.width, top: y, size: 40, align: "center" });

    const credits = creditLines(book).map((line) => `${line.label}: ${line.value}`);
    credits.unshift(book.title);
    if (options.bookUrl) credits.push(options.bookUrl);
    // The credits are owed to the authors and the license: questions give way to them, never the reverse.
    const creditsReserve = Math.max(110, credits.length * 19 + 40);

    const questions = book.discussionQuestions.filter((q) => q.trim() !== "");
    if (questions.length > 0) {
      y -= 18;
      y = writer.drawParagraph(page, "שאלות לשיחה", writer.bold, { x: column.x, width: column.width, top: y, size: 22, align: "center" });
      y -= 8;
      const size = questions.length > 5 ? 13 : 16;
      questions.forEach((question, i) => {
        if (y < contentBottom + creditsReserve) return;
        y = writer.drawParagraph(page, `${i + 1}. ${question.trim()}`, writer.regular, {
          x: column.x,
          width: column.width,
          top: y,
          size,
          leading: 1.6,
        });
        y -= 4;
      });
    }

    // The publisher's logo (required next to a Book Dash credit) sits in the margin beside the credits.
    const logo = book.credits?.publisherLogo ? await embedImage(book.credits.publisherLogo) : null;
    if (logo) {
      page.drawImage(logo, containRect({ x: MARGIN, y: contentBottom + 16, width: 92, height: 64 }, logo.width, logo.height));
    }

    let creditY = Math.min(y - 20, contentBottom + credits.length * 17 + 8);
    creditY = Math.max(creditY, contentBottom + 20);
    page.drawLine({
      start: { x: column.x, y: creditY + 6 },
      end: { x: column.x + column.width, y: creditY + 6 },
      thickness: 0.75,
      color: rgb(RULE[0], RULE[1], RULE[2]),
    });
    for (const line of credits) {
      if (creditY < MARGIN + 14) break;
      creditY = writer.drawParagraph(page, line, writer.regular, {
        x: column.x,
        width: column.width,
        top: creditY,
        size: 10.5,
        leading: 1.5,
        color: MUTED,
      });
    }
    drawFooter(page, options.siteName);
  }

  const bytes = await doc.save();
  return {
    bytes,
    sheets: doc.getPageCount(),
    missingImages,
    droppedCharacters: [...writer.dropped],
  };
}
