/**
 * GET /api/export/<bookId>
 * Downloads the book as a portable zip package (book.json + images/ + audio/).
 * Allowed for the owner of the book and for editors and admins.
 */
import { jsonError } from "@/lib/api";
import { canEditBook, requireUser } from "@/lib/auth";
import { exportBookPackage } from "@/lib/book-package";
import { importApiError } from "@/lib/importers/errors";
import { getRepo } from "@/lib/repo";
import { ID_PATTERN } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bookId: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { bookId } = await context.params;
    if (!ID_PATTERN.test(bookId)) return jsonError(404, "לא נמצא");

    const repo = await getRepo();
    const book = await repo.getBookById(bookId);
    // The same answer for "missing" and "not yours", so ids of private books cannot be probed.
    if (!book || !canEditBook(book, user)) return jsonError(404, "לא נמצא");

    const zip = await exportBookPackage(book);
    return new Response(zip as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.byteLength),
        "Content-Disposition": `attachment; filename="${book.slug}.mystory.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return importApiError(err);
  }
}
