/** Maps import and export errors to JSON responses. Server only. */
import "server-only";
import { apiError, jsonError } from "../api";
import { BookPackageError } from "../book-package";
import { BookCapError } from "../owner-books";
import { PagesImportError } from "./create-from-pages";
import { OcrError } from "./ocr";
import { UploadError } from "./request";

export function importApiError(err: unknown): Response {
  if (err instanceof UploadError) return jsonError(err.status, err.message);
  if (err instanceof BookCapError) return jsonError(err.status, err.message);
  if (err instanceof BookPackageError) {
    return jsonError(err.code === "too-large" ? 413 : 400, err.userMessage, { code: err.code });
  }
  if (err instanceof PagesImportError) {
    return jsonError(err.code === "image-too-large" ? 413 : 400, err.userMessage, { code: err.code });
  }
  if (err instanceof OcrError) {
    console.error("[import] text recognition failed:", err.message);
    return jsonError(err.status, err.userMessage);
  }
  return apiError(err);
}
