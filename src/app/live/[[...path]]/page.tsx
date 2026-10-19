/**
 * The dynamic twin of the public library pages.
 *
 * The library pages (/, /books, /book/[slug], the browse pages and the
 * collections) are static and cached (ISR) for signed-out visitors. Two kinds
 * of request need a per-request render instead, and src/proxy.ts rewrites them
 * here, keeping the address in the browser:
 *   - a signed-in visitor (header with the account menu, server-known favorites,
 *     owner and editor preview of unpublished books);
 *   - a listing with a library query string (?age=, ?sort=, ?page= ...).
 *
 * The same page components render both: the static routes get empty
 * searchParams and no viewer (force-static), and this route passes the real
 * ones. Visitors cannot open /live/... directly; the proxy answers 404.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { RawSearchParams } from "@/components/library/filters";
import { getCurrentUser } from "@/lib/auth";
import HomePage, { metadata as homeMetadata } from "../../page";
import AgePage, { generateMetadata as ageMetadata } from "../../age/[group]/page";
import { BookView, bookMetadata } from "../../book/[slug]/book-view";
import { BooksView, booksMetadata } from "../../books/books-view";
import CategoryPage, { generateMetadata as categoryMetadata } from "../../category/[slug]/page";
import CollectionPage, { generateMetadata as collectionMetadata } from "../../collections/[slug]/page";
import CollectionsPage, { metadata as collectionsMetadata } from "../../collections/page";
import TagPage, { generateMetadata as tagMetadata } from "../../tag/[tag]/page";
import ThemePage, { generateMetadata as themeMetadata } from "../../theme/[slug]/page";
import TimePage, { generateMetadata as timeMetadata } from "../../time/[bucket]/page";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<RawSearchParams>;
}

interface Route {
  page: () => ReactNode | Promise<ReactNode>;
  metadata: () => Metadata | Promise<Metadata>;
}

function resolve(path: readonly string[], searchParams: Promise<RawSearchParams>): Route | null {
  const p = <T,>(value: T) => Promise.resolve(value);
  const [section, param, ...rest] = path;
  if (rest.length > 0) return null;
  if (section === undefined) return { page: () => HomePage(), metadata: () => homeMetadata };
  if (param === undefined) {
    if (section === "books") {
      return {
        page: async () => BooksView({ searchParams: await searchParams }),
        metadata: async () => booksMetadata(await searchParams),
      };
    }
    if (section === "collections") return { page: () => CollectionsPage(), metadata: () => collectionsMetadata };
    return null;
  }
  switch (section) {
    case "book":
      return {
        page: async () => BookView({ slug: param, viewer: await getCurrentUser() }),
        metadata: async () => bookMetadata(param, await getCurrentUser()),
      };
    case "age": {
      const params = p({ group: param });
      return { page: () => AgePage({ params, searchParams }), metadata: () => ageMetadata({ params, searchParams }) };
    }
    case "category": {
      const params = p({ slug: param });
      return {
        page: () => CategoryPage({ params, searchParams }),
        metadata: () => categoryMetadata({ params, searchParams }),
      };
    }
    case "theme": {
      const params = p({ slug: param });
      return { page: () => ThemePage({ params, searchParams }), metadata: () => themeMetadata({ params, searchParams }) };
    }
    case "time": {
      const params = p({ bucket: param });
      return { page: () => TimePage({ params, searchParams }), metadata: () => timeMetadata({ params, searchParams }) };
    }
    case "tag": {
      const params = p({ tag: param });
      return { page: () => TagPage({ params, searchParams }), metadata: () => tagMetadata({ params, searchParams }) };
    }
    case "collections": {
      const params = p({ slug: param });
      return { page: () => CollectionPage({ params }), metadata: () => collectionMetadata({ params }) };
    }
    default:
      return null;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const route = resolve((await params).path ?? [], searchParams);
  if (!route) return { title: "הדף לא נמצא", robots: { index: false } };
  return route.metadata();
}

export default async function LivePage({ params, searchParams }: Props) {
  const route = resolve((await params).path ?? [], searchParams);
  if (!route) notFound();
  return route.page();
}
