/**
 * Loads the Hebrew book typeface (Frank Ruhl Libre, SIL Open Font License)
 * for the PDF export. The files come from the @fontsource package as WOFF and
 * are unpacked to TrueType once per process.
 *
 * The package splits each weight into script subsets, so a weight is a pair:
 * the "hebrew" file has the letters and vowel points, the "latin" file has
 * digits, punctuation and Latin letters.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as fontkitModule from "@pdf-lib/fontkit";
import type { ShapingFont } from "./text";
import { woffToSfnt } from "./woff";

export const PDF_FONT_KEYS = ["regular-hebrew", "regular-latin", "bold-hebrew", "bold-latin"] as const;
export type PdfFontKey = (typeof PDF_FONT_KEYS)[number];

const FONT_FILES: Record<PdfFontKey, string> = {
  "regular-hebrew": "frank-ruhl-libre-hebrew-400-normal.woff",
  "regular-latin": "frank-ruhl-libre-latin-400-normal.woff",
  "bold-hebrew": "frank-ruhl-libre-hebrew-700-normal.woff",
  "bold-latin": "frank-ruhl-libre-latin-700-normal.woff",
};

export interface LoadedFont {
  key: PdfFontKey;
  /** Plain TrueType bytes, ready to embed in a PDF. */
  bytes: Uint8Array;
  /** The same font opened for shaping. Glyph ids match the embedded bytes. */
  font: ShapingFont;
}

export type LoadedFonts = Record<PdfFontKey, LoadedFont>;

export class PdfFontsUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The Hebrew fonts for the PDF export could not be loaded", { cause });
    this.name = "PdfFontsUnavailableError";
  }
}

/** The ES build has a default export and the UMD build is the object itself. */
export const fontkit: { create(bytes: Uint8Array): unknown } =
  (fontkitModule as unknown as { default?: { create(bytes: Uint8Array): unknown } }).default ??
  (fontkitModule as unknown as { create(bytes: Uint8Array): unknown });

function fontDir(): string {
  return path.join(process.cwd(), "node_modules", "@fontsource", "frank-ruhl-libre", "files");
}

let cached: Promise<LoadedFonts> | null = null;

async function loadAll(): Promise<LoadedFonts> {
  const entries = await Promise.all(
    PDF_FONT_KEYS.map(async (key) => {
      const raw = await readFile(path.join(fontDir(), FONT_FILES[key]));
      const bytes = woffToSfnt(new Uint8Array(raw));
      const font = fontkit.create(bytes) as ShapingFont;
      return [key, { key, bytes, font }] as const;
    }),
  );
  return Object.fromEntries(entries) as LoadedFonts;
}

/** Cached for the life of the process. Throws PdfFontsUnavailableError when the files are missing. */
export function loadPdfFonts(): Promise<LoadedFonts> {
  if (!cached) {
    cached = loadAll().catch((err) => {
      cached = null;
      throw new PdfFontsUnavailableError(err);
    });
  }
  return cached;
}
