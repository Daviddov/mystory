/** Admin console URLs (pages and API). Client-safe. */
import { routes } from "@/lib/routes";

const base = routes.admin();

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export const adminPaths = {
  home: () => base,
  queue: () => `${base}/queue`,
  pipeline: (view?: string) => withQuery(`${base}/pipeline`, { view }),
  books: (
    params: {
      q?: string;
      status?: string;
      author?: string;
      sort?: string;
      audio?: string; nikud?: string;
      anim?: string;
      page?: number;
    } = {},
  ) => withQuery(`${base}/books`, params),
  book: (id: string) => `${base}/books/${encodeURIComponent(id)}`,
  collections: () => `${base}/collections`,
  taxonomy: () => `${base}/taxonomy`,
  importBooks: () => `${base}/import`,
  users: () => `${base}/users`,
} as const;

export const adminApi = {
  book: (id: string) => `/api/admin/books/${encodeURIComponent(id)}`,
  booksBulk: () => "/api/admin/books/bulk",
  bookReview: (id: string) => `/api/admin/books/${encodeURIComponent(id)}/review`,
  bookAnimate: (id: string) => `/api/admin/books/${encodeURIComponent(id)}/animate`,
  bookPush: (id: string) => `/api/admin/books/${encodeURIComponent(id)}/push`,
  recordingReview: (id: string) => `/api/admin/recordings/${encodeURIComponent(id)}/review`,
  collections: () => "/api/admin/collections",
  collection: (id: string) => `/api/admin/collections/${encodeURIComponent(id)}`,
  settings: () => "/api/admin/settings",
  importBookDash: () => "/api/admin/import/bookdash",
  user: (id: string) => `/api/admin/users/${encodeURIComponent(id)}`,
} as const;
