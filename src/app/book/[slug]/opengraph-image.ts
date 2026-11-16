import { getMediaStore, isValidMediaPath } from "@/lib/media";
import { coverShareImage, OG_SIZE, shareImagePath } from "@/lib/og-image";
import { getRepo } from "@/lib/repo";
import { SLUG_PATTERN } from "@/lib/types";

// The book's share card is drawn from its cover; it changes when the cover does.
export const dynamic = "force-dynamic";
export const alt = "כריכת הספר";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return coverShareImage(null);
  const book = await (await getRepo()).getBookBySlug(slug);
  // Only published books: a private cover must not leak through its share card.
  if (!book || book.status !== "published") return coverShareImage(null);
  const path = shareImagePath(book, isValidMediaPath);
  if (!path) return coverShareImage(null);
  const object = await (await getMediaStore()).get(path);
  return coverShareImage(object);
}
