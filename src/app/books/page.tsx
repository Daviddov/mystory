import type { Metadata } from "next";
import { BooksView, booksMetadata } from "./books-view";

// Static and cached (ISR) for signed-out visitors; see src/lib/library-cache.ts.
// Query strings and signed-in visitors go to the dynamic twin in src/app/live.
export const dynamic = "force-static";
export const revalidate = 600;

// The page never reads searchParams, not even in its metadata: Next.js
// resolves metadata before it applies force-static, so reading them there
// would turn the whole route dynamic.
export const metadata: Metadata = booksMetadata({});

export default function BooksPage() {
  return BooksView({ searchParams: {} });
}
