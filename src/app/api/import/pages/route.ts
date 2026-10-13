/**
 * POST /api/import/pages
 * multipart/form-data:
 *   meta    JSON, see PagesImportMetaSchema (title, kind, pages[{ text, hasImage }], credit?)
 *   images  one file per page that has an image, in page order
 * Creates a draft owned by the signed-in user. Response: { id, slug, title, redirect }.
 *
 * Used by the folder-of-images, PDF (pages rendered in the browser) and
 * Creative Commons imports.
 */
import { jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createDraftFromPages, PagesImportError, PagesImportMetaSchema } from "@/lib/importers/create-from-pages";
import { importApiError } from "@/lib/importers/errors";
import { IMPORT_LIMITS } from "@/lib/importers/limits";
import { assertSameOrigin, formFiles, readFormDataWithLimit, UploadError } from "@/lib/importers/request";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();

    const form = await readFormDataWithLimit(request, IMPORT_LIMITS.pagesRequestBytes);
    const rawMeta = form.get("meta");
    if (typeof rawMeta !== "string") throw new UploadError(400, "חסרים פרטי הספר.");
    let json: unknown;
    try {
      json = JSON.parse(rawMeta);
    } catch {
      throw new UploadError(400, "פרטי הספר אינם תקינים.");
    }
    const meta = PagesImportMetaSchema.parse(json);

    const files = formFiles(form, "images");
    if (files.length > IMPORT_LIMITS.pages) throw new PagesImportError("image-count");
    for (const file of files) {
      if (file.size > IMPORT_LIMITS.imageBytes) throw new PagesImportError("image-too-large", file.name);
    }
    const images = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));

    const book = await createDraftFromPages({ ownerId: user.id, meta, images });
    return jsonOk(
      { id: book.id, slug: book.slug, title: book.title, redirect: routes.studioBook(book.id) },
      { status: 201 },
    );
  } catch (err) {
    return importApiError(err);
  }
}
