/**
 * Admin console business rules. Every function takes the repository (and
 * media store) explicitly so it can be tested against a temp data dir.
 * Callers (route handlers) are responsible for authenticating the actor;
 * changeUserRole additionally re-checks the actor's role.
 */
import { AuthError } from "@/lib/auth/types";
import { withBookLock } from "@/lib/book-lock";
import { bookMediaPrefix } from "@/lib/media/url";
import type { MediaStore } from "@/lib/media/types";
import { ConflictError, NotFoundError, type Repository } from "@/lib/repo/types";
import { CATEGORIES, THEMES, STARTER_TAGS, tagSlug } from "@/lib/taxonomy";
import {
  BOOK_ORIGINS,
  BOOK_STATUSES,
  JOB_STATUSES,
  type Book,
  type BookOrigin,
  type BookStatus,
  type BookWithPages,
  type Collection,
  type GenerationJob,
  type JobStatus,
  type SiteSettings,
  type User,
  type UserRole,
} from "@/lib/types";
import type { CollectionCreateInput, CollectionUpdateInput, ReviewInput } from "./schemas";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Books: review, status, delete
// ---------------------------------------------------------------------------

/**
 * Reasons (Hebrew, for the editor) why a book cannot enter the public library
 * at all. Nobody can publish past these, not even an admin.
 */
export function publishBlockers(book: Pick<BookWithPages, "pages" | "title">): string[] {
  const blockers: string[] = [];
  if (book.pages.length === 0) blockers.push("לספר אין עמודים.");
  if (!book.title.trim()) blockers.push("חסר שם לספר.");
  return blockers;
}

/**
 * What a public book should have and this one lacks (Hebrew, for the editor):
 * Hebrew text, a license, a source, the translator of a translation. These
 * block publication like the blockers above, except that an admin may decide
 * to publish anyway.
 */
export function missingPublishCredits(
  book: Pick<Book, "license" | "source" | "language" | "originalLanguage" | "credits">,
): string[] {
  const missing: string[] = [];
  const hebrew = (book.language ?? "he") === "he";
  if (!hebrew) missing.push("הספר עדיין לא בעברית, והספרייה הציבורית מיועדת לספרים בעברית.");
  const translated = hebrew && !!book.originalLanguage && book.originalLanguage !== "he";
  if (translated && !book.credits?.translator?.trim()) missing.push("חסר שם המתרגם או המתרגמת.");
  if (!book.license.trim()) missing.push("חסר רישיון.");
  if (!book.source.trim()) missing.push("חסר מקור הספר.");
  return missing;
}

export interface PublishOptions {
  /** Publish although details are missing (see missingPublishCredits). Only honoured for an admin. */
  waiveCredits?: boolean;
  /** The acting user is an admin. */
  canWaiveCredits?: boolean;
}

async function mustGetBook(repo: Repository, id: string): Promise<BookWithPages> {
  const book = await repo.getBookById(id);
  if (!book) throw new NotFoundError(`book ${id}`);
  return book;
}

function assertPublishable(book: BookWithPages, options: PublishOptions = {}): void {
  const blockers = publishBlockers(book);
  if (!(options.waiveCredits && options.canWaiveCredits)) blockers.push(...missingPublishCredits(book));
  if (blockers.length > 0) throw new ConflictError(`אי אפשר לפרסם את הספר: ${blockers.join(" ")}`);
}

/** The book of the week must be a published book; clear it when the book leaves the library. */
async function clearBookOfTheWeekIf(repo: Repository, bookId: string): Promise<boolean> {
  const settings = await repo.getSettings();
  if (settings.bookOfTheWeekId !== bookId) return false;
  await repo.setSettings({ bookOfTheWeekId: undefined });
  return true;
}

export interface StatusChangeResult {
  book: Book;
  /** True when the book was the book of the week and the choice was cleared. */
  clearedBookOfTheWeek: boolean;
}

/** Approve (publish) or reject (back to private with a note) a book waiting in the queue. */
export function reviewBook(
  repo: Repository,
  id: string,
  input: ReviewInput,
  options: Pick<PublishOptions, "canWaiveCredits"> = {},
): Promise<StatusChangeResult> {
  // The same lock as studio saves: no edit can land between this check and the publication.
  return withBookLock(id, () => reviewBookLocked(repo, id, input, options));
}

async function reviewBookLocked(
  repo: Repository,
  id: string,
  input: ReviewInput,
  options: Pick<PublishOptions, "canWaiveCredits">,
): Promise<StatusChangeResult> {
  const current = await mustGetBook(repo, id);
  if (current.status !== "pending") {
    throw new ConflictError("הספר כבר לא ממתין לאישור. רעננו את העמוד.");
  }
  if (input.action === "approve") {
    if (input.updatedAt !== undefined && input.updatedAt !== current.updatedAt) {
      throw new ConflictError("הספר השתנה מאז שפתחתם אותו. רעננו את העמוד ועברו עליו שוב לפני האישור.");
    }
    assertPublishable(current, {
      waiveCredits: input.waiveCredits,
      canWaiveCredits: options.canWaiveCredits,
    });
    // updateBook sets publishedAt the first time; set it explicitly so a
    // re-approved book also gets a fresh date only when it never had one.
    const book = await repo.updateBook(id, {
      status: "published",
      reviewNote: undefined,
      publishedAt: current.publishedAt ?? new Date().toISOString(),
    });
    return { book, clearedBookOfTheWeek: false };
  }
  const book = await repo.updateBook(id, {
    status: "private",
    reviewNote: input.note,
  });
  return { book, clearedBookOfTheWeek: await clearBookOfTheWeekIf(repo, id) };
}

/** Direct status change from the all-books table. */
export async function setBookStatus(
  repo: Repository,
  id: string,
  status: BookStatus,
  options: PublishOptions = {},
): Promise<StatusChangeResult> {
  const current = await mustGetBook(repo, id);
  if (current.status === status) {
    const { pages: _pages, ...book } = current;
    return { book, clearedBookOfTheWeek: false };
  }
  if (status === "published") {
    assertPublishable(current, options);
    const book = await repo.updateBook(id, {
      status,
      reviewNote: undefined,
      publishedAt: current.publishedAt ?? new Date().toISOString(),
    });
    return { book, clearedBookOfTheWeek: false };
  }
  // A book that leaves the library must not stay open through a share link
  // that was created (and possibly seen by others) while it was public.
  const leavingLibrary = current.status === "published" && !!current.shareToken;
  const book = await repo.updateBook(id, leavingLibrary ? { status, shareToken: undefined } : { status });
  return { book, clearedBookOfTheWeek: await clearBookOfTheWeekIf(repo, id) };
}

export interface DeleteBookResult {
  /** False when the book record was removed but its media files could not be deleted. */
  mediaDeleted: boolean;
}

export async function deleteBookAndMedia(
  repo: Repository,
  media: Pick<MediaStore, "deletePrefix">,
  id: string,
): Promise<DeleteBookResult> {
  await mustGetBook(repo, id);
  await repo.deleteBook(id);
  try {
    await media.deletePrefix(bookMediaPrefix(id));
    return { mediaDeleted: true };
  } catch (err) {
    console.error(`[admin] book ${id} deleted but its media could not be removed`, err);
    return { mediaDeleted: false };
  }
}

// ---------------------------------------------------------------------------
// Collections, book of the week
// ---------------------------------------------------------------------------

async function assertBooksExist(repo: Repository, bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return;
  const { books } = await repo.listBooks({ status: "any", ids: bookIds });
  const known = new Set(books.map((b) => b.id));
  const missing = bookIds.filter((id) => !known.has(id));
  if (missing.length > 0) throw new ConflictError(`ספרים שלא נמצאו: ${missing.join(", ")}`);
}

export async function createCollection(repo: Repository, input: CollectionCreateInput): Promise<Collection> {
  await assertBooksExist(repo, input.bookIds);
  return repo.createCollection({
    title: input.title,
    description: input.description,
    bookIds: input.bookIds,
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.season ? { season: input.season } : {}),
  });
}

export async function updateCollection(
  repo: Repository,
  id: string,
  input: CollectionUpdateInput,
): Promise<Collection> {
  if (input.bookIds) await assertBooksExist(repo, input.bookIds);
  const { season, ...rest } = input;
  return repo.updateCollection(id, {
    ...rest,
    // null removes the season; undefined (absent) leaves it unchanged.
    ...(season === undefined ? {} : { season: season ?? undefined }),
  });
}

export async function setBookOfTheWeek(repo: Repository, bookId: string | null): Promise<SiteSettings> {
  if (bookId === null) return repo.setSettings({ bookOfTheWeekId: undefined });
  const book = await mustGetBook(repo, bookId);
  if (book.status !== "published") {
    throw new ConflictError("רק ספר מפורסם יכול להיות ספר השבוע.");
  }
  return repo.setSettings({ bookOfTheWeekId: bookId });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** True when the user's email is listed in ADMIN_EMAILS (their role is forced to admin on every read). */
export function isEnvAdmin(user: Pick<User, "email">, envAdminEmails: readonly string[]): boolean {
  return !!user.email && envAdminEmails.includes(user.email.toLowerCase());
}

export async function changeUserRole(
  repo: Repository,
  actor: Pick<User, "id" | "role">,
  targetId: string,
  role: UserRole,
  envAdminEmails: readonly string[],
): Promise<User> {
  if (actor.role !== "admin") throw new AuthError(403);
  if (actor.id === targetId) {
    throw new ConflictError("אי אפשר לשנות את התפקיד של עצמך.");
  }
  const target = await repo.getUser(targetId);
  if (!target) throw new NotFoundError(`user ${targetId}`);
  if (role !== "admin" && isEnvAdmin(target, envAdminEmails)) {
    throw new ConflictError("המשתמש מוגדר כמנהל בהגדרות השרת (ADMIN_EMAILS), ולכן אי אפשר לשנות את התפקיד שלו כאן.");
  }
  return repo.setUserRole(targetId, role);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface GenerationStats {
  total: number;
  byStatus: Record<JobStatus, number>;
  wizard: number;
  daily: number;
  /** Jobs where at least one mock provider produced part of the result. */
  usedMock: number;
  /** Sum of the measured cost of the week's jobs (jobs without a cost count as 0). */
  costUsd: number;
}

export interface DashboardStats {
  totalBooks: number;
  byStatus: Record<BookStatus, number>;
  byOrigin: Record<BookOrigin, number>;
  mostViewed: Book[];
  bookOfTheWeek: Book | null;
  generations: GenerationStats;
  collections: number;
}

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

export function summarizeGenerations(jobs: GenerationJob[], now: Date = new Date()): GenerationStats {
  const from = new Date(now.getTime() - WEEK_MS).toISOString();
  const stats: GenerationStats = {
    total: 0,
    byStatus: zeroCounts(JOB_STATUSES),
    wizard: 0,
    daily: 0,
    usedMock: 0,
    costUsd: 0,
  };
  for (const job of jobs) {
    if (job.createdAt < from) continue;
    stats.total += 1;
    stats.byStatus[job.status] += 1;
    if (job.kind === "daily") stats.daily += 1;
    else stats.wizard += 1;
    if (job.usedMock) stats.usedMock += 1;
    stats.costUsd += job.costUsd ?? 0;
  }
  return stats;
}

export async function getDashboardStats(repo: Repository, now: Date = new Date()): Promise<DashboardStats> {
  const [{ books }, jobs, settings, collections] = await Promise.all([
    repo.listBooks({ status: "any" }),
    repo.listJobs(),
    repo.getSettings(),
    repo.listCollections(),
  ]);
  const byStatus = zeroCounts(BOOK_STATUSES);
  const byOrigin = zeroCounts(BOOK_ORIGINS);
  for (const book of books) {
    byStatus[book.status] += 1;
    byOrigin[book.origin] += 1;
  }
  const mostViewed = books
    .filter((b) => b.status === "published" && b.viewCount > 0)
    .sort((a, b) => b.viewCount - a.viewCount || a.title.localeCompare(b.title, "he"))
    .slice(0, 5);
  return {
    totalBooks: books.length,
    byStatus,
    byOrigin,
    mostViewed,
    bookOfTheWeek: books.find((b) => b.id === settings.bookOfTheWeekId) ?? null,
    generations: summarizeGenerations(jobs, now),
    collections: collections.length,
  };
}

// ---------------------------------------------------------------------------
// Tag / theme / category usage
// ---------------------------------------------------------------------------

export interface UsageRow {
  /** Category or theme slug; for tags the Hebrew label. */
  key: string;
  /** Books of any status. */
  total: number;
  published: number;
  /** Themes and categories: the slug is in taxonomy.ts. Tags: the label is a starter tag. */
  known: boolean;
}

export interface TaxonomyUsage {
  tags: UsageRow[];
  themes: UsageRow[];
  categories: UsageRow[];
  /** Books without any tag / theme / category. */
  untagged: number;
  withoutTheme: number;
  withoutCategory: number;
  totalBooks: number;
}

function bump(map: Map<string, UsageRow>, id: string, key: string, published: boolean, known: boolean): void {
  const row = map.get(id) ?? { key, total: 0, published: 0, known };
  row.total += 1;
  if (published) row.published += 1;
  map.set(id, row);
}

function sortUsage(rows: Iterable<UsageRow>): UsageRow[] {
  return [...rows].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, "he"));
}

export function computeTaxonomyUsage(books: Book[]): TaxonomyUsage {
  const starter = new Set(STARTER_TAGS.map((t) => tagSlug(t)));
  const tags = new Map<string, UsageRow>();
  // Themes and categories start with every known slug so unused ones show up with 0.
  const themes = new Map<string, UsageRow>(
    THEMES.map((t) => [t.slug, { key: t.slug, total: 0, published: 0, known: true }]),
  );
  const categories = new Map<string, UsageRow>(
    CATEGORIES.map((c) => [c.slug, { key: c.slug, total: 0, published: 0, known: true }]),
  );
  let untagged = 0;
  let withoutTheme = 0;
  let withoutCategory = 0;

  for (const book of books) {
    const published = book.status === "published";
    if (book.tags.length === 0) untagged += 1;
    if (book.themes.length === 0) withoutTheme += 1;
    if (book.categories.length === 0) withoutCategory += 1;
    // Count each tag once per book even when it is written twice.
    for (const slug of new Set(book.tags.map((t) => tagSlug(t)))) {
      const label = book.tags.find((t) => tagSlug(t) === slug) ?? slug;
      bump(tags, slug, label, published, starter.has(slug));
    }
    for (const slug of new Set(book.themes)) bump(themes, slug, slug, published, false);
    for (const slug of new Set(book.categories)) bump(categories, slug, slug, published, false);
  }

  return {
    tags: sortUsage(tags.values()),
    themes: sortUsage(themes.values()),
    categories: sortUsage(categories.values()),
    untagged,
    withoutTheme,
    withoutCategory,
    totalBooks: books.length,
  };
}

// ---------------------------------------------------------------------------
// Small display helpers shared by pages
// ---------------------------------------------------------------------------

export async function ownerNames(repo: Repository): Promise<Map<string, string>> {
  const users = await repo.listUsers();
  return new Map(users.map((u) => [u.id, u.name]));
}
