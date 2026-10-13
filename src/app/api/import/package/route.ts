/**
 * POST /api/import/package
 * multipart/form-data with one field `file`: a book package zip.
 * Creates a draft owned by the signed-in user. Response: { id, slug, title, redirect }.
 */
import { jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { BookPackageError, importBookPackage } from "@/lib/book-package";
import { importApiError } from "@/lib/importers/errors";
import { IMPORT_LIMITS } from "@/lib/importers/limits";
import { assertOwnerCanAddBook } from "@/lib/owner-books";
import { getRepo } from "@/lib/repo";
import { assertSameOrigin, formFiles, readFormDataWithLimit, UploadError } from "@/lib/importers/request";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Room for the multipart boundaries and headers around the zip. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    // Checked before the (large) body is read.
    await assertOwnerCanAddBook(await getRepo(), user.id);

    const form = await readFormDataWithLimit(request, IMPORT_LIMITS.packageBytes + FORM_OVERHEAD_BYTES);
    const [file] = formFiles(form, "file");
    if (!file) throw new UploadError(400, "לא נבחר קובץ.");
    if (file.size > IMPORT_LIMITS.packageBytes) throw new BookPackageError("too-large");

    const book = await importBookPackage(new Uint8Array(await file.arrayBuffer()), {
      ownerId: user.id,
      status: "draft",
      origin: "import",
    });
    return jsonOk(
      { id: book.id, slug: book.slug, title: book.title, redirect: routes.studioBook(book.id) },
      { status: 201 },
    );
  } catch (err) {
    return importApiError(err);
  }
}
