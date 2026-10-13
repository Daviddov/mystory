/**
 * URL <-> library query. Client-safe and pure, so it is unit tested.
 *
 * Every browse page reads the same query-string keys:
 *   age, category, theme, time, tag, q, sort, page
 * Unknown or invalid values are dropped instead of failing the page.
 */
import { z } from "zod";
import type { BookFilter } from "@/lib/repo/types";
import {
  CATEGORY_SLUGS,
  READING_TIME_SLUGS,
  THEME_SLUGS,
  categoryLabel,
  getAgeGroup,
  getReadingTimeBucket,
  themeLabel,
  type ReadingTimeBucket,
} from "@/lib/taxonomy";
import { AGE_GROUPS, type AgeGroup } from "@/lib/types";

export const PAGE_SIZE = 24;
export const MAX_QUERY_LENGTH = 100;
export const MAX_TAG_LENGTH = 60;

export const SORT_OPTIONS = [
  { value: "new", label: "החדשים ביותר" },
  { value: "popular", label: "הכי נקראים" },
  { value: "title", label: "לפי שם, א עד ת" },
] as const;

export type LibrarySort = (typeof SORT_OPTIONS)[number]["value"];
export const DEFAULT_SORT: LibrarySort = "new";

/** Shape of `await searchParams` in a Next.js page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface LibraryQuery {
  age?: AgeGroup;
  category?: string;
  theme?: string;
  time?: ReadingTimeBucket;
  tag?: string;
  q?: string;
  sort: LibrarySort;
  /** 1-based. */
  page: number;
}

export type LibraryFilterKey = "age" | "category" | "theme" | "time" | "tag" | "q";
export const FILTER_KEYS: readonly LibraryFilterKey[] = ["age", "category", "theme", "time", "tag", "q"];

const trimmed = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim().slice(0, max))
    .transform((value) => (value === "" ? undefined : value));

const oneOf = (allowed: readonly string[]) => z.string().refine((value) => allowed.includes(value));

const LibraryQuerySchema = z.object({
  age: z.enum(AGE_GROUPS).optional().catch(undefined),
  category: oneOf(CATEGORY_SLUGS).optional().catch(undefined),
  theme: oneOf(THEME_SLUGS).optional().catch(undefined),
  time: oneOf(READING_TIME_SLUGS).optional().catch(undefined),
  tag: trimmed(MAX_TAG_LENGTH).optional().catch(undefined),
  q: trimmed(MAX_QUERY_LENGTH).optional().catch(undefined),
  sort: z
    .enum(SORT_OPTIONS.map((option) => option.value) as [LibrarySort, ...LibrarySort[]])
    .catch(DEFAULT_SORT),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

/** Parses and validates the query string. Never throws. */
export function parseLibraryQuery(raw: RawSearchParams | undefined | null): LibraryQuery {
  const source = raw ?? {};
  const parsed = LibraryQuerySchema.parse({
    age: first(source.age),
    category: first(source.category),
    theme: first(source.theme),
    time: first(source.time),
    tag: first(source.tag),
    q: first(source.q),
    sort: first(source.sort) ?? DEFAULT_SORT,
    page: first(source.page) ?? 1,
  });
  return { ...parsed, time: parsed.time as ReadingTimeBucket | undefined };
}

/**
 * Repository filter for a query. `base` holds what the page itself fixes
 * (e.g. the category of a category page) and always wins over the URL.
 * The status is never taken from the URL, so only published books are listed.
 */
export function toBookFilter(query: LibraryQuery, base: BookFilter = {}, pageSize: number = PAGE_SIZE): BookFilter {
  return {
    ageGroup: query.age,
    category: query.category,
    theme: query.theme,
    timeBucket: query.time,
    tag: query.tag,
    query: query.q,
    ...base,
    status: "published",
    sort: query.sort,
    limit: pageSize,
    offset: (query.page - 1) * pageSize,
  };
}

/** Query-string values of a query, without defaults (sort=new, page=1). */
export function toParams(query: Partial<LibraryQuery>): Record<string, string | number | undefined> {
  return {
    age: query.age,
    category: query.category,
    theme: query.theme,
    time: query.time,
    tag: query.tag,
    q: query.q,
    sort: query.sort && query.sort !== DEFAULT_SORT ? query.sort : undefined,
    page: query.page && query.page > 1 ? query.page : undefined,
  };
}

/** Builds `<path>?<query>` and skips empty values. */
export function buildHref(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

/** Link to the same listing with some values changed. Changing anything but the page returns to page 1. */
export function hrefWith(path: string, query: LibraryQuery, patch: Partial<LibraryQuery>): string {
  const next: Partial<LibraryQuery> = { ...query, ...patch };
  if (!("page" in patch)) next.page = 1;
  return buildHref(path, toParams(next));
}

export function totalPages(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function hasActiveFilters(query: LibraryQuery): boolean {
  return FILTER_KEYS.some((key) => query[key] !== undefined);
}

export interface ActiveFilter {
  key: LibraryFilterKey;
  label: string;
  emoji?: string;
}

/** Human readable (Hebrew) description of each active filter, for removable chips. */
export function describeActiveFilters(query: LibraryQuery): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (query.q) active.push({ key: "q", label: `חיפוש: ${query.q}`, emoji: "🔎" });
  if (query.age) {
    const info = getAgeGroup(query.age);
    active.push({ key: "age", label: info?.label ?? query.age, emoji: info?.emoji });
  }
  if (query.category) active.push({ key: "category", label: categoryLabel(query.category) });
  if (query.time) active.push({ key: "time", label: getReadingTimeBucket(query.time)?.label ?? query.time });
  if (query.theme) active.push({ key: "theme", label: `נושא: ${themeLabel(query.theme)}` });
  if (query.tag) active.push({ key: "tag", label: `תגית: ${query.tag}` });
  return active;
}

/** Page numbers to show in the pager; `null` marks a gap. */
export function pageWindow(current: number, last: number, radius: number = 1): (number | null)[] {
  const wanted = new Set<number>([1, last]);
  for (let page = current - radius; page <= current + radius; page++) {
    if (page >= 1 && page <= last) wanted.add(page);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) result.push(null);
    result.push(page);
    previous = page;
  }
  return result;
}

/** "ספר אחד" / "12 ספרים". */
export function bookCountLabel(total: number): string {
  if (total === 0) return "אין ספרים";
  if (total === 1) return "ספר אחד";
  return `${total} ספרים`;
}
