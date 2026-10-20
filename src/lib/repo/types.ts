import type {
  AgeGroup,
  Book,
  BookOrigin,
  BookStatus,
  BookWithPages,
  Collection,
  Comment,
  Favorite,
  Rating,
  RatingSummary,
  GenerationJob,
  JobStatus,
  Page,
  Progress,
  Recording,
  RecordingStatus,
  SiteSettings,
  User,
  UserRole,
  WaitlistEntry,
  WaitlistInterest,
} from "../types";
import type { ReadingTimeBucket } from "../taxonomy";

export type BookSort = "new" | "popular" | "title" | "updated";

export interface BookFilter {
  /**
   * SAFE DEFAULT: when omitted only 'published' books are returned.
   * Pass a status, a list of statuses, or 'any' to see everything.
   */
  status?: BookStatus | BookStatus[] | "any";
  ageGroup?: AgeGroup;
  /** Category slug. */
  category?: string;
  /** Tag label or tag slug (compared with tagSlug()). */
  tag?: string;
  /** Discussion theme slug. */
  theme?: string;
  timeBucket?: ReadingTimeBucket;
  ownerId?: string;
  origin?: BookOrigin;
  /** Free text; matches title, summary, author, illustrator, tags and category/theme labels. Nikud-insensitive. */
  query?: string;
  /** Restrict to these book ids. The result order still follows `sort`. */
  ids?: string[];
  /** Exclude these book ids (e.g. the current book in "more like this"). */
  excludeIds?: string[];
  /** Default 'new' (publishedAt, falling back to createdAt, newest first). */
  sort?: BookSort;
  limit?: number;
  offset?: number;
}

export interface BookListResult {
  books: Book[];
  /** Number of matches before limit/offset. */
  total: number;
}

/**
 * Input for createBook. Everything except the title has a default:
 * id (generated), slug (from the title, made unique), status 'draft',
 * origin 'manual', ageGroup '3-5', readingMinutes (estimated from pages),
 * empty strings / arrays, viewCount 0, timestamps now.
 */
export type NewBookInput = Partial<Omit<Book, "title" | "createdAt" | "updatedAt">> & {
  title: string;
  ownerId: string;
  pages?: Page[];
};

/** Fields that updateBook may change. id and createdAt are immutable. */
export type BookPatch = Partial<Omit<Book, "id" | "createdAt">>;

export type NewCollectionInput = Omit<Collection, "id" | "slug"> & { id?: string; slug?: string };
export type CollectionPatch = Partial<Omit<Collection, "id">>;

export type NewJobInput = Pick<GenerationJob, "ownerId"> &
  Partial<Omit<GenerationJob, "ownerId" | "createdAt">>;
export type JobPatch = Partial<Omit<GenerationJob, "id" | "ownerId" | "createdAt">>;

export interface JobFilter {
  ownerId?: string;
  status?: JobStatus | JobStatus[];
  kind?: "wizard" | "daily";
  /** Newest first; default no limit. */
  limit?: number;
}

export interface RecordingFilter {
  userId?: string;
  bookId?: string;
  status?: RecordingStatus;
}

export type NewRecordingInput = Pick<Recording, "bookId" | "userId" | "title">;
export type RecordingPatch = Partial<Omit<Recording, "id" | "bookId" | "userId" | "createdAt" | "updatedAt">>;

export interface NewCommentInput {
  bookId: string;
  userId: string;
  /** The author's display name (never the e-mail). */
  authorName: string;
  /** Plain text, already trimmed and validated (1-1000 characters). */
  body: string;
}

export interface UpsertUserInput {
  /** When omitted, an existing user with the same email is reused, otherwise a new id is generated. */
  id?: string;
  name: string;
  email?: string;
  /** Only applied when creating a user or when explicitly provided. Default 'parent'. */
  role?: UserRole;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * The single data-access contract. All methods are async. Returned objects are
 * plain JSON-serializable copies; mutating them does not change stored data.
 * Methods that target a missing record throw NotFoundError unless noted.
 */
export interface Repository {
  readonly kind: "local" | "supabase";

  // --- Books ---
  listBooks(filter?: BookFilter): Promise<BookListResult>;
  /** No status check: the caller decides who may see the book (see canViewBook in "@/lib/auth"). */
  getBookById(id: string): Promise<BookWithPages | null>;
  getBookBySlug(slug: string): Promise<BookWithPages | null>;
  getBookByShareToken(token: string): Promise<BookWithPages | null>;
  /** Every book of any status with its pages, in one read. For staff screens that inspect page content. */
  listAllBooksWithPages(): Promise<BookWithPages[]>;
  createBook(input: NewBookInput): Promise<BookWithPages>;
  /** Changing the slug keeps it unique (throws ConflictError when taken). Sets updatedAt; sets publishedAt the first time status becomes 'published'. */
  updateBook(id: string, patch: BookPatch): Promise<Book>;
  /** Removes the book, its favorites and progress, and its ids from collections and settings. Does NOT delete media; call getMediaStore().deletePrefix(bookMediaPrefix(id)). Idempotent. */
  deleteBook(id: string): Promise<void>;
  /** Replaces all pages. Indexes are rewritten to 0..n-1 in the given order. */
  replacePages(bookId: string, pages: Page[]): Promise<BookWithPages>;
  /** Returns the new view count. Does not touch updatedAt. */
  incrementViews(bookId: string): Promise<number>;

  // --- Collections ---
  listCollections(): Promise<Collection[]>;
  getCollectionById(id: string): Promise<Collection | null>;
  getCollectionBySlug(slug: string): Promise<Collection | null>;
  createCollection(input: NewCollectionInput): Promise<Collection>;
  updateCollection(id: string, patch: CollectionPatch): Promise<Collection>;
  /** Idempotent. */
  deleteCollection(id: string): Promise<void>;

  // --- Site settings ---
  getSettings(): Promise<SiteSettings>;
  /** Shallow merge; a key set to undefined is removed. */
  setSettings(patch: Partial<SiteSettings>): Promise<SiteSettings>;

  // --- Favorites ---
  addFavorite(userId: string, bookId: string): Promise<Favorite>;
  removeFavorite(userId: string, bookId: string): Promise<void>;
  /** Newest first. */
  listFavorites(userId: string): Promise<Favorite[]>;
  isFavorite(userId: string, bookId: string): Promise<boolean>;

  // --- Ratings ---
  /** Creates or replaces the user's rating (1-5). */
  setRating(userId: string, bookId: string, stars: number): Promise<Rating>;
  /** Idempotent. */
  removeRating(userId: string, bookId: string): Promise<void>;
  getRating(userId: string, bookId: string): Promise<Rating | null>;
  getRatingSummary(bookId: string): Promise<RatingSummary>;

  // --- Waiting list (demand test for paid credits and printed books) ---
  /** Adds the e-mail, or merges the interests into its existing entry. `created` tells which. */
  addWaitlistEntry(email: string, interests: WaitlistInterest[]): Promise<{ entry: WaitlistEntry; created: boolean }>;
  /** Oldest first. */
  listWaitlist(): Promise<WaitlistEntry[]>;

  // --- Comments ---
  /** Throws NotFoundError when the book does not exist. */
  addComment(input: NewCommentInput): Promise<Comment>;
  /** Newest first, at most `limit` (default 200). */
  listComments(bookId: string, limit?: number): Promise<Comment[]>;
  getComment(id: string): Promise<Comment | null>;
  /** Idempotent. */
  deleteComment(id: string): Promise<void>;

  // --- Reading progress ---
  getProgress(userId: string, bookId: string): Promise<Progress | null>;
  setProgress(
    userId: string,
    bookId: string,
    pageIndex: number,
    completed?: boolean,
  ): Promise<Progress>;
  /** Most recently updated first. */
  listProgress(userId: string): Promise<Progress[]>;

  // --- Family recordings ---
  /** Most recently updated first. */
  listRecordings(filter?: RecordingFilter): Promise<Recording[]>;
  getRecording(id: string): Promise<Recording | null>;
  createRecording(input: NewRecordingInput): Promise<Recording>;
  /** Shallow merge; a key set to undefined is removed. Throws NotFoundError. */
  updateRecording(id: string, patch: RecordingPatch): Promise<Recording>;
  /** Idempotent. Does not remove the media files. */
  deleteRecording(id: string): Promise<void>;

  // --- Users ---
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  upsertUser(input: UpsertUserInput): Promise<User>;
  listUsers(): Promise<User[]>;
  setUserRole(id: string, role: UserRole): Promise<User>;

  // --- AI generation jobs ---
  createJob(input: NewJobInput): Promise<GenerationJob>;
  getJob(id: string): Promise<GenerationJob | null>;
  updateJob(id: string, patch: JobPatch): Promise<GenerationJob>;
  /** Newest first. */
  listJobs(filter?: JobFilter): Promise<GenerationJob[]>;
  /** Idempotent. */
  deleteJob(id: string): Promise<void>;
  /**
   * Weekly AI quota usage: number of generation jobs of this owner created at
   * or after `since` (default: 7 days ago) whose status is not 'failed'.
   */
  countWeeklyGenerations(ownerId: string, since?: Date): Promise<number>;
}
