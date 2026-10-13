/**
 * PDF import, entirely in the browser: every page is rendered to a JPEG and
 * its text layer becomes the page text. The PDF itself is never uploaded.
 *
 * BROWSER ONLY. pdf.js is loaded on demand, so import this module only from
 * client components and call it from event handlers.
 */
import { textFromPdfItems, type PdfTextItemLike } from "./pdf-text";

export interface PdfPageResult {
  /** 1-based page number in the PDF. */
  pageNumber: number;
  image: Blob;
  text: string;
  width: number;
  height: number;
}

export interface PdfImportResult {
  pages: PdfPageResult[];
  /** Number of pages in the PDF; larger than pages.length when the page limit cut it. */
  totalPages: number;
}

export interface PdfImportOptions {
  maxPages: number;
  /** Longest edge of a rendered page in pixels. Default 1600. */
  maxEdge?: number;
  /** JPEG quality 0..1. Default 0.85. */
  quality?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** The PDF could not be opened (damaged, encrypted, or not a PDF). */
export class PdfImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfImportError";
  }
}

type PdfJs = typeof import("pdfjs-dist");

let pdfJsPromise: Promise<PdfJs> | undefined;

/** Loads pdf.js once and starts its worker. The bundler emits the worker file from the URL below. */
function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
    }
    return pdfjs;
  });
  pdfJsPromise.catch(() => {
    pdfJsPromise = undefined;
  });
  return pdfJsPromise;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PdfImportError("could not encode the page image"))),
      "image/jpeg",
      quality,
    );
  });
}

/** Renders the pages of a PDF file to images and reads their text. */
export async function importPdf(file: Blob, options: PdfImportOptions): Promise<PdfImportResult> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.85;
  const pdfjs = await loadPdfJs();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new PdfImportError("could not open the PDF", { cause: err });
  }

  try {
    const totalPages = pdf.numPages;
    const count = Math.min(totalPages, options.maxPages);
    const pages: PdfPageResult[] = [];
    const canvas = document.createElement("canvas");

    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await pdf.getPage(pageNumber);

      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, maxEdge / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      // pdf.js paints a white page background itself, which JPEG (no transparency) needs.
      await page.render({ canvas, viewport }).promise;
      const image = await canvasToJpeg(canvas, quality);

      const content = await page.getTextContent();
      const text = textFromPdfItems(content.items as PdfTextItemLike[]);

      pages.push({ pageNumber, image, text, width: canvas.width, height: canvas.height });
      page.cleanup();
      options.onProgress?.(pageNumber, count);
    }
    return { pages, totalPages };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
