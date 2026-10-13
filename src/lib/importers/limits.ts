/** Import limits and accepted media types. Client-safe: used by the import UI and by the server routes. */

import { BOOK_LIMITS } from "../limits";

const MB = 1024 * 1024;

export const IMPORT_LIMITS = {
  /** Largest zip package accepted. */
  packageBytes: 50 * MB,
  /** Largest number of entries inside a package (files and folders). */
  packageEntries: 600,
  /** Total size of a package after decompression (zip bomb guard). */
  packageUncompressedBytes: 200 * MB,
  /** Largest book.json. */
  manifestBytes: 2 * MB,
  /** Largest single illustration. */
  imageBytes: 15 * MB,
  /** Largest single narration or soundtrack file. */
  audioBytes: 30 * MB,
  /** Largest number of pages in one imported book: the same limit the studio saves with. */
  pages: BOOK_LIMITS.pages,
  /** Largest "images / PDF" upload request (all page images together). */
  pagesRequestBytes: 80 * MB,
  /** Largest PDF opened in the browser (it is never uploaded). */
  pdfBytes: 100 * MB,
  /** Longest text of one page: the same limit the studio saves with. */
  pageTextChars: BOOK_LIMITS.pageTextChars,
  /** Largest image sent to text recognition. */
  ocrImageBytes: 4 * MB,
} as const;

/** Image file extensions accepted as illustrations inside a book package, mapped to their content type. */
export const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** Audio file extensions accepted as narration, mapped to their content type. */
export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  webm: "audio/webm",
};

/** Lowercase extension without the dot; "" when the name has none. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** A picture a user may pick as a page image. SVG is not one: only book packages may carry (inert) SVG. */
export function isImageFileName(name: string): boolean {
  const extension = fileExtension(name);
  return extension !== "svg" && extension in IMAGE_EXTENSIONS;
}

export function isZipFileName(name: string): boolean {
  return fileExtension(name) === "zip";
}

export function isPdfFileName(name: string): boolean {
  return fileExtension(name) === "pdf";
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}
