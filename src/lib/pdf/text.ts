/**
 * Hebrew text layout for the PDF export.
 *
 * pdf-lib's own drawText() cannot be used for Hebrew: it asks fontkit to shape
 * the string but keeps only the glyph ids, so the GPOS offsets that put vowel
 * points (nikud) under their letters are thrown away, and it knows nothing
 * about mixed-direction text. Here the work is done explicitly:
 *
 *   1. bidi.ts splits a line into visual runs,
 *   2. each run is split by font (the Hebrew and Latin glyphs live in two
 *      separate font files),
 *   3. fontkit shapes each piece, giving glyph ids with advances and offsets,
 *   4. book-pdf.ts writes those glyphs at exact positions.
 *
 * This file has no dependency on pdf-lib, so the layout is unit-testable.
 */
import { bidiRuns, isCombiningMark, type Direction } from "./bidi";

/** The parts of a fontkit font this module uses. */
export interface ShapingFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(
    text: string,
    features?: unknown,
    script?: string,
    language?: string,
    direction?: Direction,
  ): {
    glyphs: { id: number; advanceWidth: number }[];
    positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[];
  };
}

/** One font slot. `key` identifies the embedded PDF font that draws these glyphs. */
export interface FontFace<K extends string = string> {
  key: K;
  font: ShapingFont;
}

/** A weight of the typeface: Hebrew glyphs and Latin glyphs come from two files. */
export interface FontPair<K extends string = string> {
  hebrew: FontFace<K>;
  latin: FontFace<K>;
}

export interface PlacedGlyph {
  id: number;
  /** Position of the glyph origin relative to the line start, in em units (1 = font size). */
  x: number;
  y: number;
  /** The glyph's own advance width in em units, as stored in the PDF font. */
  advance: number;
}

export interface GlyphSegment<K extends string = string> {
  fontKey: K;
  glyphs: PlacedGlyph[];
}

export interface LineLayout<K extends string = string> {
  /** Segments in visual order, left to right. */
  segments: GlyphSegment<K>[];
  /** Total advance of the line in em units. */
  width: number;
  /** Characters that neither font can draw (for example emoji); they were left out. */
  dropped: string[];
}

function pickFace<K extends string>(cp: number, pair: FontPair<K>, previous: FontFace<K> | null): FontFace<K> | null {
  // Spaces and other shared characters stay in the current font, so a
  // sentence is not chopped into one segment per word.
  if (previous && previous.font.hasGlyphForCodePoint(cp)) {
    const isHebrew = cp >= 0x0590 && cp <= 0x05ff;
    if (!isHebrew || previous === pair.hebrew) return previous;
  }
  if (pair.hebrew.font.hasGlyphForCodePoint(cp)) return pair.hebrew;
  if (pair.latin.font.hasGlyphForCodePoint(cp)) return pair.latin;
  return null;
}

/** Replace characters the fonts do not have with close equivalents they do have. */
function normalizeChar(ch: string): string {
  switch (ch) {
    case "\t":
    case " ":
    case " ":
    case " ":
      return " ";
    // Directional marks carry no glyph.
    case "‎":
    case "‏":
    case "​":
    case "‌":
    case "‍":
    case "﻿":
      return "";
    default:
      return ch;
  }
}

/** Shape one line (no line breaks) into positioned glyphs in visual order. */
export function layoutLine<K extends string>(line: string, pair: FontPair<K>): LineLayout<K> {
  const segments: GlyphSegment<K>[] = [];
  const dropped: string[] = [];
  let pen = 0;

  const clean = Array.from(line.normalize("NFC")).map(normalizeChar).join("");

  for (const run of bidiRuns(clean)) {
    // Split the run by font, in logical order.
    const pieces: { face: FontFace<K>; text: string }[] = [];
    let current: FontFace<K> | null = null;
    for (const ch of Array.from(run.text)) {
      const cp = ch.codePointAt(0) as number;
      let face: FontFace<K> | null;
      if (isCombiningMark(cp) && current && current.font.hasGlyphForCodePoint(cp)) face = current;
      else face = pickFace(cp, pair, current);
      if (!face) {
        dropped.push(ch);
        continue;
      }
      const last = pieces[pieces.length - 1];
      if (last && last.face === face) last.text += ch;
      else pieces.push({ face, text: ch });
      current = face;
    }

    // Inside an rtl run the pieces themselves read right to left.
    const visualPieces = run.direction === "rtl" ? pieces.reverse() : pieces;
    for (const piece of visualPieces) {
      const { font } = piece.face;
      const scale = 1 / font.unitsPerEm;
      // fontkit returns rtl glyphs already in visual order.
      const shaped = font.layout(piece.text, undefined, run.direction === "rtl" ? "hebr" : "latn", undefined, run.direction);
      const glyphs: PlacedGlyph[] = [];
      shaped.glyphs.forEach((glyph, i) => {
        const position = shaped.positions[i];
        glyphs.push({
          id: glyph.id,
          x: pen + position.xOffset * scale,
          y: position.yOffset * scale,
          advance: glyph.advanceWidth * scale,
        });
        pen += position.xAdvance * scale;
      });
      if (glyphs.length > 0) segments.push({ fontKey: piece.face.key, glyphs });
    }
  }

  return { segments, width: pen, dropped };
}

/** Width of a line in em units. */
export function measureLine<K extends string>(line: string, pair: FontPair<K>): number {
  return layoutLine(line, pair).width;
}

/**
 * Greedy word wrap. `maxWidth` is in em units (box width divided by font
 * size). Explicit line breaks are kept; a blank line stays an empty line. A
 * single word wider than the box gets a line of its own.
 */
export function wrapText<K extends string>(text: string, pair: FontPair<K>, maxWidth: number): string[] {
  const lines: string[] = [];
  const spaceWidth = measureLine(" ", pair);
  const widths = new Map<string, number>();
  const widthOf = (word: string): number => {
    let width = widths.get(word);
    if (width === undefined) {
      width = measureLine(word, pair);
      widths.set(word, width);
    }
    return width;
  };

  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.split(/[ \t ]+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    let lineWidth = 0;
    for (const word of words) {
      const wordWidth = widthOf(word);
      if (line !== "" && lineWidth + spaceWidth + wordWidth > maxWidth) {
        lines.push(line);
        line = word;
        lineWidth = wordWidth;
      } else {
        lineWidth = line === "" ? wordWidth : lineWidth + spaceWidth + wordWidth;
        line = line === "" ? word : `${line} ${word}`;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FittedText {
  fontSize: number;
  lineHeight: number;
  lines: string[];
}

/**
 * Pick the largest font size (from `maxSize` down to `minSize`, in points)
 * at which the wrapped text fits a box. When even `minSize` overflows, the
 * minimum size is returned with `overflow: true` and the caller decides.
 */
export function fitText<K extends string>(
  text: string,
  pair: FontPair<K>,
  box: { width: number; height: number },
  options: { maxSize: number; minSize: number; leading: number; step?: number },
): FittedText & { overflow: boolean } {
  const step = options.step ?? 1;
  for (let size = options.maxSize; size >= options.minSize; size -= step) {
    const lines = wrapText(text, pair, box.width / size);
    const lineHeight = size * options.leading;
    const widest = Math.max(0, ...lines.map((l) => measureLine(l, pair) * size));
    if (lines.length * lineHeight <= box.height && widest <= box.width) {
      return { fontSize: size, lineHeight, lines, overflow: false };
    }
  }
  const size = options.minSize;
  return {
    fontSize: size,
    lineHeight: size * options.leading,
    lines: wrapText(text, pair, box.width / size),
    overflow: true,
  };
}
