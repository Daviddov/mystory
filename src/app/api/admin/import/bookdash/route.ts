/**
 * Book Dash import for the admin console. Editors and admins only.
 *
 *   GET  [?refresh=1]   -> { rows, complete, fetchedAt }   the catalogue with each book's local state
 *   POST { slug }       -> { status: "created" | "skipped", book: {...}, warnings }
 *
 * A book that was imported before is never replaced from here (that needs the
 * CLI with --force). The new draft belongs to the editor who imported it.
 */
import { z } from "zod";
import { requireAdminApi, readJson } from "@/app/admin/_lib/guard";
import { apiError, jsonError, jsonOk } from "@/lib/api";
import { missingCreditRoles } from "@/lib/credits";
import { BookDashError, importBookDashBook } from "@/lib/importers/bookdash";
import { bookDashClient, cachedBookDashCatalogue, withLocalState } from "@/lib/importers/bookdash-catalogue";
import { getMediaStore } from "@/lib/media";
import { getRepo } from "@/lib/repo";
import { bookLanguage, SlugSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
/** One book is about sixteen downloads. */
export const maxDuration = 120;

const STATUS_OF: Record<BookDashError["code"], number> = {
  "invalid-slug": 400,
  "not-found": 404,
  "rate-limited": 503,
  network: 502,
  "invalid-book": 422,
  "no-text": 422,
  media: 502,
};

function bookDashApiError(err: unknown): Response {
  if (err instanceof BookDashError) {
    console.error(`[bookdash] ${err.message}`);
    return jsonError(STATUS_OF[err.code], err.userMessage, { code: err.code });
  }
  return apiError(err);
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApi(request, "editor");
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const catalogue = await cachedBookDashCatalogue({ refresh });
    const rows = await withLocalState(await getRepo(), catalogue.entries);
    return jsonOk({ rows, complete: catalogue.complete, fetchedAt: catalogue.fetchedAt });
  } catch (err) {
    return bookDashApiError(err);
  }
}

const ImportSchema = z.strictObject({ slug: SlugSchema });

/** Slugs being imported right now: a second click must not start a second download of the same book. */
const running = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireAdminApi(request, "editor");
    const { slug } = await readJson(request, ImportSchema);
    if (running.has(slug)) return jsonError(409, "הספר הזה כבר מיובא כרגע.");
    running.add(slug);
    try {
      const [repo, media] = await Promise.all([getRepo(), getMediaStore()]);
      const result = await importBookDashBook({ slug, ownerId: user.id, repo, media, client: bookDashClient() });
      const { book } = result;
      return jsonOk(
        {
          status: result.status,
          warnings: result.warnings,
          book: {
            id: book.id,
            slug: book.slug,
            title: book.title,
            status: book.status,
            pages: book.pages.length,
            translated: bookLanguage(book) === "he",
            missingCredits: missingCreditRoles(book),
          },
        },
        { status: result.status === "created" ? 201 : 200 },
      );
    } finally {
      running.delete(slug);
    }
  } catch (err) {
    return bookDashApiError(err);
  }
}
