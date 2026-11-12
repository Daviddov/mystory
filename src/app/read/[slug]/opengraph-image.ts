import { getMediaStore, isValidMediaPath } from "@/lib/media";
import { coverShareImage, OG_SIZE } from "@/lib/og-image";
import { getRepo } from "@/lib/repo";
import { SLUG_PATTERN } from "@/lib/types";

// The reader's share card is the book's cover, same as the book page. Only published books:
// a private book is shared through its /share link, which has its own card.
export const dynamic = "force-dynamic";
export const alt = "כריכת הספר";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return coverShareImage(null);
  const book = await (await getRepo()).getBookBySlug(slug);
  if (!book || book.status !== "published" || !isValidMediaPath(book.coverImage)) return coverShareImage(null);
  const object = await (await getMediaStore()).get(book.coverImage);
  return coverShareImage(object);
}
