/**
 * Infinite scroll for the book listings: what the browser asks for and what it
 * gets back. Client-safe and pure, so it is unit tested.
 *
 * A listing page renders its first page on the server (for SEO and no-JS
 * visitors). InfiniteBookGrid then asks GET /api/library for the next pages
 * of the same listing. The listing is named by a "scope" (which page it is:
 * a category, a tag, a holiday, the search...) plus the usual library query
 * string; the server rebuilds the page's fixed filter from the scope, so the
 * browser never sends book ids or raw repository filters.
 */
import type { BookFilter } from "@/lib/repo/types";
import type { PublicBook } from "@/lib/public-book";
import { CATEGORY_SLUGS, READING_TIME_SLUGS, THEME_SLUGS, type ReadingTimeBucket } from "@/lib/taxonomy";
import { AGE_GROUPS, type AgeGroup } from "@/lib/types";
import { MAX_TAG_LENGTH, buildHref } from "./filters";

export const LISTING_API = "/api/library";

/** Which listing page the books come from. */
export type ListingScope =
  | { kind: "books" }
  | { kind: "search" }
  | { kind: "age"; value: AgeGroup }
  | { kind: "category"; value: string }
  | { kind: "theme"; value: string }
  | { kind: "time"; value: ReadingTimeBucket }
  | { kind: "tag"; value: string }
  | { kind: "parasha"; value: string }
  | { kind: "holiday"; value: string };

/** One card of a listing, with the per-card flags the server decided. */
export interface ListingItem {
  book: PublicBook;
  /** Shows the "חדש" badge. */
  isNew: boolean;
  /** The signed-in viewer finished this book. */
  read?: boolean;
}

/** Body of GET /api/library. */
export interface ListingPageResponse {
  items: ListingItem[];
  /** The page these items are from (1-based). */
  page: number;
  pages: number;
  total: number;
}

/** "category:animals", "books", "tag:סבא וסבתא". */
export function encodeScope(scope: ListingScope): string {
  return "value" in scope ? `${scope.kind}:${scope.value}` : scope.kind;
}

/** Inverse of encodeScope(). Unknown or invalid scopes give null. Occasion slugs are checked by the server. */
export function parseScope(raw: string | null | undefined): ListingScope | null {
  if (!raw) return null;
  const colon = raw.indexOf(":");
  const kind = colon === -1 ? raw : raw.slice(0, colon);
  const value = colon === -1 ? "" : raw.slice(colon + 1);
  switch (kind) {
    case "books":
    case "search":
      return colon === -1 ? { kind } : null;
    case "age":
      return (AGE_GROUPS as readonly string[]).includes(value) ? { kind, value: value as AgeGroup } : null;
    case "category":
      return CATEGORY_SLUGS.includes(value) ? { kind, value } : null;
    case "theme":
      return THEME_SLUGS.includes(value) ? { kind, value } : null;
    case "time":
      return READING_TIME_SLUGS.includes(value) ? { kind, value: value as ReadingTimeBucket } : null;
    case "tag": {
      const tag = value.trim();
      return tag !== "" && tag.length <= MAX_TAG_LENGTH ? { kind, value: tag } : null;
    }
    case "parasha":
    case "holiday":
      return /^[a-z0-9-]{1,60}$/.test(value) ? { kind, value } : null;
    default:
      return null;
  }
}

/** The scope of a browse page from the filter it fixes. Null when it cannot be told (pass the scope explicitly). */
export function scopeForBase(base: BookFilter): ListingScope | null {
  if (base.ids !== undefined || base.excludeIds !== undefined) return null;
  if (base.ageGroup) return { kind: "age", value: base.ageGroup };
  if (base.category) return { kind: "category", value: base.category };
  if (base.theme) return { kind: "theme", value: base.theme };
  if (base.timeBucket) return { kind: "time", value: base.timeBucket };
  if (base.tag) return { kind: "tag", value: base.tag };
  return null;
}

/** Address of one page of a listing. `params` are the listing's query-string values without the page. */
export function listingApiUrl(
  scope: ListingScope,
  params: Record<string, string | number | undefined>,
  page: number,
): string {
  return buildHref(LISTING_API, { ...params, scope: encodeScope(scope), page });
}

/** Appends new items, skipping books already shown (the order can shift between requests). */
export function appendItems(shown: readonly ListingItem[], incoming: readonly ListingItem[]): ListingItem[] {
  const seen = new Set(shown.map((item) => item.book.id));
  const added: ListingItem[] = [];
  for (const item of incoming) {
    if (seen.has(item.book.id)) continue;
    seen.add(item.book.id);
    added.push(item);
  }
  return added.length === 0 ? [...shown] : [...shown, ...added];
}

/** Loose check of a response body, so a broken reply shows the error state instead of crashing. */
export function isListingPageResponse(value: unknown): value is ListingPageResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<ListingPageResponse>;
  return (
    Array.isArray(body.items) &&
    typeof body.page === "number" &&
    typeof body.pages === "number" &&
    typeof body.total === "number" &&
    body.items.every(
      (item) => typeof item === "object" && item !== null && typeof item.book?.id === "string",
    )
  );
}
