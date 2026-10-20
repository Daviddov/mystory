/** Every route of the site in one place. Client-safe. Always build links with these helpers. */
import { tagSlug } from "./taxonomy";

function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export const routes = {
  home: () => "/",
  books: (params: Record<string, string | number | undefined> = {}) => withQuery("/books", params),
  age: (group: string) => `/age/${group}`,
  category: (slug: string) => `/category/${slug}`,
  tag: (tag: string) => `/tag/${encodeURIComponent(tagSlug(tag))}`,
  time: (bucket: string) => `/time/${bucket}`,
  theme: (slug: string) => `/theme/${slug}`,
  /** Weekly Torah portion pages (lib/occasions.ts). */
  parashot: () => "/parasha",
  parasha: (slug: string) => `/parasha/${slug}`,
  holidays: () => "/holidays",
  holiday: (slug: string) => `/holidays/${slug}`,
  collections: () => "/collections",
  collection: (slug: string) => `/collections/${slug}`,
  search: (query?: string) => withQuery("/search", { q: query }),
  /** Book details page. */
  book: (slug: string) => `/book/${slug}`,
  /** Reader. `page` is 1-based in the URL; `listen` asks the reader to start the narration. */
  read: (slug: string, page?: number, listen?: boolean) =>
    withQuery(`/read/${slug}`, { page, listen: listen ? 1 : undefined }),
  /** Reader that plays a family recording. */
  readVoice: (slug: string, recordingId: string) => withQuery(`/read/${slug}`, { voice: recordingId }),
  /** Reader opened from a book's cover: it first asks whether to read, listen or download. */
  readStart: (slug: string) => withQuery(`/read/${slug}`, { start: 1 }),
  /** Continuous bedtime listening queue. */
  listen: () => "/listen",
  print: (slug: string, token?: string) => withQuery(`/print/${slug}`, { token }),
  /** Printable PDF download (API route). */
  pdf: (slug: string, params: { nikud?: 1; token?: string } = {}) => withQuery(`/api/pdf/${slug}`, params),
  /** Zip package download of a book the caller may edit (API route). */
  exportBook: (id: string) => `/api/export/${id}`,
  /** Books downloaded to this device for reading without a network. */
  offline: () => "/offline",
  studio: () => "/studio",
  studioNew: () => "/studio/new",
  studioBook: (id: string) => `/studio/${id}`,
  studioImport: () => "/studio/import",
  /** AI creation wizard. */
  create: () => "/create",
  /** Public landing page for personal books and printed books (with the waiting list). */
  personalBook: () => "/personal-book",
  me: () => "/me",
  favorites: () => "/me/favorites",
  share: (token: string) => `/share/${token}`,
  admin: () => "/admin",
  about: () => "/about",
  faq: () => "/faq",
  privacy: () => "/privacy",
  terms: () => "/terms",
  login: (next?: string) => withQuery("/login", { next }),
  logout: () => "/logout",
} as const;
