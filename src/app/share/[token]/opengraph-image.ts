import { getMediaStore, isValidMediaPath } from "@/lib/media";
import { coverShareImage, OG_SIZE } from "@/lib/og-image";
import { getRepo } from "@/lib/repo";

// The share card of a share link is drawn from the book's cover. The link's token is the
// credential, so this works for private books too (and only for the book that carries it).
export const dynamic = "force-dynamic";
export const alt = "כריכת הספר";
export const size = OG_SIZE;
export const contentType = "image/png";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return coverShareImage(null);
  const book = await (await getRepo()).getBookByShareToken(token);
  if (!book || book.shareToken !== token || !isValidMediaPath(book.coverImage)) return coverShareImage(null);
  const object = await (await getMediaStore()).get(book.coverImage);
  return coverShareImage(object);
}
