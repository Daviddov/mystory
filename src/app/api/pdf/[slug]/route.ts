/**
 * GET /api/pdf/<slug>            the book as a printable PDF (A4 landscape)
 *   ?nikud=1                     use the vocalized text where a page has it
 *   ?token=<shareToken>          access to a private book through its share link
 *   ?inline=1                    open in the browser instead of downloading
 *
 * Read-only. Published books are public; anything else needs the owner, an
 * editor or the share token (canViewBook). A book the caller may not see
 * answers 404, so the route does not reveal which slugs exist.
 *
 * Building a PDF is CPU heavy and open to anonymous visitors, so it is rate
 * limited per user, or per IP address when signed out (RATE_LIMIT_PDF_PER_HOUR,
 * in-process: see @/lib/rate-limit).
 */
import { z } from "zod";
import { apiError, jsonError } from "@/lib/api";
import { canViewBook, getCurrentUser } from "@/lib/auth";
import { getBookPdf, PdfFontsUnavailableError } from "@/lib/pdf";
import { rateLimited } from "@/lib/rate-limit";
import { getRepo } from "@/lib/repo";
import { SlugSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  nikud: z.enum(["0", "1"]).optional(),
  inline: z.enum(["0", "1"]).optional(),
  token: z.string().min(1).max(200).optional(),
});

/** The story pages plus cover and closing sheet; a guard against absurd documents. */
const MAX_PAGES = 200;

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = SlugSchema.parse(rawSlug);
    const url = new URL(request.url);
    const query = QuerySchema.parse({
      nikud: url.searchParams.get("nikud") ?? undefined,
      inline: url.searchParams.get("inline") ?? undefined,
      token: url.searchParams.get("token") ?? undefined,
    });

    const repo = await getRepo();
    const book = await repo.getBookBySlug(slug);
    const user = await getCurrentUser();
    if (!book || !canViewBook(book, user, query.token)) return jsonError(404, "הספר לא נמצא");
    if (book.pages.length === 0) return jsonError(409, "בספר הזה עדיין אין עמודים להדפסה");
    if (book.pages.length > MAX_PAGES) return jsonError(413, "הספר ארוך מדי להורדה כקובץ אחד");
    const limited = rateLimited("PDF", { request, user });
    if (limited) return limited;

    const pdf = await getBookPdf(book, { nikud: query.nikud === "1" });

    const disposition = query.inline === "1" ? "inline" : "attachment";
    const utf8Name = encodeURIComponent(`${book.title}.pdf`).replace(
      /['()*]/g,
      (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(pdf.bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.bytes.byteLength),
        // ASCII fallback from the slug, and the Hebrew title for browsers that read filename*.
        "Content-Disposition": `${disposition}; filename="${book.slug}.pdf"; filename*=UTF-8''${utf8Name}`,
        "Cache-Control": book.status === "published" ? "public, max-age=300" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        "X-Pdf-Sheets": String(pdf.sheets),
        "X-Pdf-Missing-Images": String(pdf.missingImages.length),
      },
    });
  } catch (err) {
    if (err instanceof PdfFontsUnavailableError) {
      console.error("[pdf] fonts unavailable", err);
      return jsonError(503, "אי אפשר ליצור קובץ PDF כרגע. אפשר להדפיס ישירות מדף ההדפסה.");
    }
    return apiError(err);
  }
}
