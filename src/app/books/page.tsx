import type { Metadata } from "next";
import { BOOKS_TITLE_EN, BooksView, booksMetadata } from "./books-view";
import { localizeTitle } from "@/lib/i18n/metadata";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

// The page never reads searchParams, not even in its metadata: Next.js
// resolves metadata before it applies force-static, so reading them there
// would turn the whole route dynamic.
const HEBREW_METADATA: Metadata = booksMetadata({});

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, BOOKS_TITLE_EN);
}

export default function BooksPage() {
  return BooksView({ searchParams: {} });
}
