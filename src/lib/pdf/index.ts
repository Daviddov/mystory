/**
 * PDF export entry point for Route Handlers. Server only.
 *
 *   const { bytes } = await getBookPdf(book, { nikud: true });
 *
 * The caller is responsible for the access check (canViewBook).
 */
import "server-only";
import { siteUrl } from "../config";
import { getMediaStore } from "../media";
import { routes } from "../routes";
import type { BookWithPages } from "../types";
import { buildBookPdf, type BookPdfResult } from "./book-pdf";
import { rasterizeForPdf } from "./images";

export { buildBookPdf, type BookPdfResult, type BuildBookPdfOptions, type PdfRasterImage } from "./book-pdf";
export { PdfFontsUnavailableError } from "./fonts";
export { bookHasNikud, creditLines, printablePages, type PrintablePage } from "./printable";

export const SITE_NAME = "הסיפור שלי";

/** Finished files are kept briefly, so a second click does not rasterize every illustration again. */
const CACHE_LIMIT = 6;
const cache = new Map<string, Promise<BookPdfResult>>();

function cacheKey(book: BookWithPages, nikud: boolean): string {
  return `${book.id}|${book.updatedAt}|${nikud ? "nikud" : "plain"}`;
}

export interface GetBookPdfOptions {
  nikud?: boolean;
}

export function getBookPdf(book: BookWithPages, options: GetBookPdfOptions = {}): Promise<BookPdfResult> {
  const nikud = options.nikud === true;
  const key = cacheKey(book, nikud);
  const hit = cache.get(key);
  if (hit) {
    // Refresh the entry's position (the Map keeps insertion order).
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const job = (async () => {
    const store = await getMediaStore();
    return buildBookPdf(book, {
      nikud,
      siteName: SITE_NAME,
      // Private books are reached through a share link, which is not printed.
      bookUrl: book.status === "published" ? `${siteUrl()}${routes.book(book.slug)}` : undefined,
      loadImage: async (mediaPath) => {
        const object = await store.get(mediaPath);
        if (!object) return null;
        return rasterizeForPdf(object.bytes, object.contentType);
      },
    });
  })();

  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return job;
}
