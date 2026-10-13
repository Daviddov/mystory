/**
 * GET /offline/book/<bookId>[?token=<share token>] -> OfflineBook
 *
 * Everything the device needs to keep a book for reading without a network:
 * the text of every page and the URLs of its illustrations and narration.
 * The caller must be allowed to view the book (published, owner, editor, or a
 * valid share token). Never cached by the server or the service worker; the
 * "download for offline" button stores it on the device explicitly.
 */
import { apiError, jsonOk } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/media/url";
import { BookIdSchema, NO_STORE, ShareTokenSchema, loadViewableBook } from "@/components/personal/server";
import { OFFLINE_FORMAT_VERSION, type OfflineBook, type OfflinePage } from "@/components/pwa/offline-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ bookId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const bookId = BookIdSchema.parse((await context.params).bookId);
    const rawToken = new URL(request.url).searchParams.get("token");
    const token = rawToken ? ShareTokenSchema.parse(rawToken) : undefined;
    const user = await getCurrentUser();
    const book = await loadViewableBook({ bookId }, user, token);

    // The media URLs never carry the share token: this document is stored on
    // the device. downloadBook() adds the token to its own download requests.
    const version = book.updatedAt;
    const cover = mediaUrl(book.coverImage, version);
    const pages: OfflinePage[] = book.pages.map((page) => ({
      index: page.index,
      text: page.text,
      textNikud: page.textNikud,
      image: mediaUrl(page.image, version) || undefined,
      audio: mediaUrl(page.audio, version) || undefined,
      wordTimings: page.wordTimings,
      audioSource: page.audioSource,
    }));
    const assets = [cover, ...pages.flatMap((page) => [page.image, page.audio])].filter(
      (url): url is string => !!url,
    );

    const body: OfflineBook = {
      version: OFFLINE_FORMAT_VERSION,
      id: book.id,
      slug: book.slug,
      title: book.title,
      summary: book.summary,
      author: book.author,
      illustrator: book.illustrator,
      license: book.license,
      ageGroup: book.ageGroup,
      readingMinutes: book.readingMinutes,
      updatedAt: book.updatedAt,
      cover,
      isPublic: book.status === "published",
      pages,
      assets: [...new Set(assets)],
    };
    return jsonOk(body, { headers: NO_STORE });
  } catch (err) {
    return apiError(err);
  }
}
