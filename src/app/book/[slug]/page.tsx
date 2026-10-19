import type { Metadata } from "next";
import { BookView, bookMetadata } from "./book-view";

/**
 * Static and cached (ISR), for signed-out visitors: rendered on the first
 * visit, then served from the cache and rebuilt every 10 minutes, or right
 * away when a book changes (revalidateLibrary in src/lib/library-cache.ts).
 * force-static also makes cookies() empty, and the viewer is null on top of
 * that, so this route can only ever render a published book.
 * Signed-in visitors are rewritten to /live/book/[slug] by src/proxy.ts.
 */
export const dynamic = "force-static";
export const revalidate = 600;

interface Props {
  params: Promise<{ slug: string }>;
}

/** No book is built ahead: each one is rendered on its first visit, then cached. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return bookMetadata((await params).slug, null);
}

export default async function BookPage({ params }: Props) {
  return BookView({ slug: (await params).slug, viewer: null });
}
