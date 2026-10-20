/**
 * SupabaseRepository: the Repository contract on Postgres (schema in
 * supabase/migrations). Loaded lazily by getRepo() in ./index.ts only when the
 * Supabase env vars are set, so local mode never imports this file.
 *
 * It connects with the SERVICE-ROLE key, which bypasses row level security:
 * like LocalRepository it performs no access checks, and callers authorise
 * with canViewBook / canEditBook / requireRole. The RLS policies protect the
 * tables against direct use of the public anon key.
 *
 * No "server-only" import here so that supabase/import-local.ts can run under
 * tsx; the key is read from the environment and never reaches client bundles.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../config";
import { estimateReadingMinutes, normalizeForSearch, slugify } from "../hebrew";
import { newId } from "../ids";
import { categoryLabel, tagSlug, themeLabel } from "../taxonomy";
import {
  BookSchema,
  BookWithPagesSchema,
  CollectionSchema,
  FavoriteSchema,
  RatingSchema,
  WaitlistEntrySchema,
  GenerationJobSchema,
  ID_PATTERN,
  PageSchema,
  ProgressSchema,
  RecordingSchema,
  SiteSettingsSchema,
  SLUG_PATTERN,
  UserSchema,
  type Book,
  type BookWithPages,
  type Collection,
  type Favorite,
  type Rating,
  type RatingSummary,
  type WaitlistEntry,
  type WaitlistInterest,
  type GenerationJob,
  type Page,
  type Progress,
  type Recording,
  type SiteSettings,
  type User,
  type UserRole,
} from "../types";
import {
  ConflictError,
  NotFoundError,
  type BookFilter,
  type BookListResult,
  type BookPatch,
  type CollectionPatch,
  type JobFilter,
  type JobPatch,
  type NewBookInput,
  type NewCollectionInput,
  type NewJobInput,
  type NewRecordingInput,
  type RecordingFilter,
  type RecordingPatch,
  type Repository,
  type UpsertUserInput,
} from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
/** PostgREST: the requested range starts after the last row. */
const RANGE_NOT_SATISFIABLE = "PGRST103";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

interface AdminGlobal {
  __mystorySupabaseAdmin?: { key: string; client: SupabaseClient };
}
const globalRef = globalThis as unknown as AdminGlobal;

/**
 * Process-wide service-role client (no session, no cookies). Server only.
 * Throws a clear error when SUPABASE_SERVICE_ROLE_KEY is missing.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const config = supabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  if (!config.serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required when the Supabase env vars are set: the server reads and " +
        "writes data and media with it. Set it, or unset NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY to use the local JSON repository.",
    );
  }
  const key = `${config.url}|${config.serviceRoleKey}`;
  const cached = globalRef.__mystorySupabaseAdmin;
  if (cached && cached.key === key) return cached.client;
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  globalRef.__mystorySupabaseAdmin = { key, client };
  return client;
}

export async function createSupabaseRepository(): Promise<Repository> {
  return new SupabaseRepository(getSupabaseAdmin());
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface DbError {
  code?: string;
  message: string;
  details?: string | null;
}

interface PageRow {
  page_index: number;
  text: string;
  text_nikud: string | null;
  image: string | null;
  audio: string | null;
  word_timings: unknown;
  audio_source: string | null;
  original_text?: string | null;
  image_alt?: string | null;
  video?: string | null;
  video_image_hash?: string | null;
  video_source?: string | null;
}

interface BookRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  author: string;
  illustrator: string;
  license: string;
  source: string;
  age_group: string;
  reading_minutes: number | string;
  cover_image: string;
  status: string;
  owner_id: string;
  categories: string[];
  tags: string[];
  themes: string[];
  discussion_questions: string[];
  share_token: string | null;
  origin: string;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  soundtrack: string | null;
  review_note: string | null;
  cost_usd: number | string | null;
  language?: string | null;
  original_language?: string | null;
  credits?: unknown;
  hero?: unknown;
  pages?: PageRow[] | null;
}

interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  book_ids: string[];
  season: string | null;
}

interface ProfileRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  created_at: string | null;
}

interface FavoriteRow {
  user_id: string;
  book_id: string;
  created_at: string;
}

interface RatingRow {
  user_id: string;
  book_id: string;
  stars: number;
  created_at: string;
  updated_at: string;
}

interface ProgressRow {
  user_id: string;
  book_id: string;
  page_index: number;
  completed: boolean;
  updated_at: string;
}

interface RecordingRow {
  id: string;
  book_id: string;
  user_id: string;
  title: string;
  status: string;
  review_note: string | null;
  pages: unknown;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

const RECORDING_COLUMNS = "id,book_id,user_id,title,status,review_note,pages,created_at,updated_at,submitted_at";

interface JobRow {
  id: string;
  owner_id: string;
  status: string;
  step: string;
  progress: number | string;
  book_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string | null;
  kind: string | null;
  input: unknown;
  message: string | null;
  used_mock: boolean | null;
  cost_usd: number | string | null;
}

/** Book property -> column. id and createdAt are handled separately. */
const BOOK_COLUMN_OF: Record<keyof Book, string> = {
  id: "id",
  slug: "slug",
  title: "title",
  summary: "summary",
  author: "author",
  illustrator: "illustrator",
  license: "license",
  source: "source",
  ageGroup: "age_group",
  readingMinutes: "reading_minutes",
  coverImage: "cover_image",
  status: "status",
  ownerId: "owner_id",
  categories: "categories",
  tags: "tags",
  themes: "themes",
  discussionQuestions: "discussion_questions",
  shareToken: "share_token",
  origin: "origin",
  viewCount: "view_count",
  createdAt: "created_at",
  updatedAt: "updated_at",
  publishedAt: "published_at",
  soundtrack: "soundtrack",
  reviewNote: "review_note",
  costUsd: "cost_usd",
  language: "language",
  originalLanguage: "original_language",
  credits: "credits",
  hero: "hero",
};

const BOOK_COLUMNS = Object.values(BOOK_COLUMN_OF).join(",");
const PAGE_COLUMNS = "page_index,text,text_nikud,image,audio,word_timings,audio_source,original_text,image_alt,video,video_image_hash,video_source";
const BOOK_WITH_PAGES_COLUMNS = `${BOOK_COLUMNS},pages(${PAGE_COLUMNS})`;
const COLLECTION_COLUMNS = "id,slug,title,description,book_ids,season";
const PROFILE_COLUMNS = "id,name,email,role,created_at";
const JOB_COLUMNS =
  "id,owner_id,status,step,progress,book_id,error,created_at,updated_at,kind,input,message,used_mock,cost_usd";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Postgres timestamptz ("...+00:00") -> the ISO form the local repository stores ("...Z"). */
function iso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/** Drops null / undefined values so optional fields are absent, as in the JSON files. */
function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null && entry !== undefined) out[key] = entry;
  }
  return out as T;
}

function fail(context: string, error: DbError): never {
  throw new Error(`[supabase] ${context}: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

function normalizePages(pages: Page[]): Page[] {
  return pages.map((page, index) => ({ ...page, index }));
}

function pageFromRow(row: PageRow): Page {
  return compact({
    index: row.page_index,
    text: row.text,
    textNikud: row.text_nikud,
    image: row.image,
    audio: row.audio,
    wordTimings: row.word_timings,
    audioSource: row.audio_source,
    originalText: row.original_text,
    imageAlt: row.image_alt,
    video: row.video,
    videoImageHash: row.video_image_hash,
    videoSource: row.video_source,
  }) as Page;
}

function bookObjectFromRow(row: BookRow): Record<string, unknown> {
  return compact({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    author: row.author,
    illustrator: row.illustrator,
    license: row.license,
    source: row.source,
    ageGroup: row.age_group,
    readingMinutes: Number(row.reading_minutes),
    coverImage: row.cover_image,
    status: row.status,
    ownerId: row.owner_id,
    categories: row.categories,
    tags: row.tags,
    themes: row.themes,
    discussionQuestions: row.discussion_questions,
    shareToken: row.share_token,
    origin: row.origin,
    viewCount: row.view_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    publishedAt: row.published_at === null ? null : iso(row.published_at),
    soundtrack: row.soundtrack,
    reviewNote: row.review_note,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    language: row.language,
    originalLanguage: row.original_language,
    credits: row.credits,
    hero: row.hero,
  });
}

/** Invalid rows are skipped with a warning, like invalid book.json files. */
function bookFromRow(row: BookRow): Book | null {
  const parsed = BookSchema.safeParse(bookObjectFromRow(row));
  if (parsed.success) return parsed.data;
  console.warn(`[repo] skipping invalid book ${row.id}: ${parsed.error.message}`);
  return null;
}

function bookWithPagesFromRow(row: BookRow): BookWithPages | null {
  const pages = [...(row.pages ?? [])].sort((a, b) => a.page_index - b.page_index).map(pageFromRow);
  const parsed = BookWithPagesSchema.safeParse({ ...bookObjectFromRow(row), pages: normalizePages(pages) });
  if (parsed.success) return parsed.data;
  console.warn(`[repo] skipping invalid book ${row.id}: ${parsed.error.message}`);
  return null;
}

function toBook(full: BookWithPages): Book {
  const copy: Partial<BookWithPages> = clone(full);
  delete copy.pages;
  return copy as Book;
}

/** The nikud-free haystack used by `query`; same fields as LocalRepository. */
function searchText(book: Book, pageTexts: string[]): string {
  return normalizeForSearch(
    [
      book.title,
      book.summary,
      book.author,
      book.illustrator,
      ...book.tags,
      ...book.categories.map(categoryLabel),
      ...book.themes.map(themeLabel),
      ...pageTexts,
    ].join(" "),
  );
}

/** A one-element Postgres array literal, safe for any text (used with the `cs` filter). */
function arrayLiteral(value: string): string {
  return `{"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"}`;
}

function collectionFromRow(row: CollectionRow): Collection {
  return CollectionSchema.parse(
    compact({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      bookIds: row.book_ids,
      season: row.season,
    }),
  );
}

function userFromRow(row: ProfileRow): User | null {
  const parsed = UserSchema.safeParse(
    compact({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at === null ? null : iso(row.created_at),
    }),
  );
  if (parsed.success) return parsed.data;
  console.warn(`[repo] skipping invalid user ${row.id}: ${parsed.error.message}`);
  return null;
}

function ratingFromRow(row: RatingRow): Rating {
  return RatingSchema.parse({
    userId: row.user_id,
    bookId: row.book_id,
    stars: row.stars,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function favoriteFromRow(row: FavoriteRow): Favorite {
  return FavoriteSchema.parse({ userId: row.user_id, bookId: row.book_id, createdAt: iso(row.created_at) });
}

function progressFromRow(row: ProgressRow): Progress {
  return ProgressSchema.parse({
    userId: row.user_id,
    bookId: row.book_id,
    pageIndex: row.page_index,
    completed: row.completed,
    updatedAt: iso(row.updated_at),
  });
}

function recordingFromRow(row: RecordingRow): Recording | null {
  const parsed = RecordingSchema.safeParse({
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    reviewNote: row.review_note ?? undefined,
    pages: Array.isArray(row.pages) ? row.pages : [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    submittedAt: row.submitted_at ? iso(row.submitted_at) : undefined,
  });
  if (parsed.success) return parsed.data;
  console.warn(`[repo] skipping invalid recording ${row.id}: ${parsed.error.message}`);
  return null;
}

function jobFromRow(row: JobRow): GenerationJob {
  return GenerationJobSchema.parse(
    compact({
      id: row.id,
      ownerId: row.owner_id,
      status: row.status,
      step: row.step,
      progress: Number(row.progress),
      bookId: row.book_id,
      error: row.error,
      createdAt: iso(row.created_at),
      updatedAt: row.updated_at === null ? null : iso(row.updated_at),
      kind: row.kind,
      input: row.input,
      message: row.message,
      usedMock: row.used_mock,
      costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    }),
  );
}

/** Every column, with null for absent optional fields (so an update can clear them). */
function jobToRow(job: GenerationJob): JobRow {
  return {
    id: job.id,
    owner_id: job.ownerId,
    status: job.status,
    step: job.step,
    progress: job.progress,
    book_id: job.bookId ?? null,
    error: job.error ?? null,
    created_at: job.createdAt,
    updated_at: job.updatedAt ?? null,
    kind: job.kind ?? null,
    input: job.input ?? null,
    message: job.message ?? null,
    used_mock: job.usedMock ?? null,
    cost_usd: job.costUsd ?? null,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;

  constructor(private readonly db: SupabaseClient) {}

  // --- books: internals --------------------------------------------------------

  private async fetchBook(column: "id" | "slug", value: string): Promise<BookWithPages | null> {
    const { data, error } = await this.db
      .from("books")
      .select(BOOK_WITH_PAGES_COLUMNS)
      .eq(column, value)
      .maybeSingle();
    if (error) fail(`read book by ${column}`, error);
    return data ? bookWithPagesFromRow(data as unknown as BookRow) : null;
  }

  private async uniqueSlug(base: string): Promise<string> {
    if (!SLUG_PATTERN.test(base)) throw new Error(`invalid slug: ${base}`);
    const stem = base.slice(0, 70);
    const { data, error } = await this.db
      .from("books")
      .select("slug")
      .or(`slug.eq.${base},slug.like.${stem}-%`);
    if (error) fail("read slugs", error);
    const taken = new Set((data as { slug: string }[]).map((row) => row.slug));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${stem}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async writePages(book: Book, pages: Page[], updatedAt: string): Promise<void> {
    const { error } = await this.db.rpc("replace_book_pages", {
      p_book_id: book.id,
      p_pages: pages,
      p_search_text: searchText(book, pages.map((p) => p.text)),
      p_updated_at: updatedAt,
    });
    if (!error) return;
    if (error.code === "P0002") throw new NotFoundError(`book ${book.id}`);
    fail("replace pages", error);
  }

  // --- books: public API ---------------------------------------------------------

  async listBooks(filter: BookFilter = {}): Promise<BookListResult> {
    const statuses =
      filter.status === "any"
        ? null
        : Array.isArray(filter.status)
          ? filter.status
          : [filter.status ?? "published"];
    // Ids that cannot exist in the table are dropped, which also keeps the
    // filter strings free of PostgREST syntax characters.
    const ids = filter.ids?.filter((id) => ID_PATTERN.test(id));
    const excluded = filter.excludeIds?.filter((id) => ID_PATTERN.test(id)) ?? [];
    const tokens = filter.query
      ? normalizeForSearch(filter.query)
          .replace(/[%*\\]/g, " ")
          .split(" ")
          .filter(Boolean)
      : [];
    if ((statuses && statuses.length === 0) || (ids && ids.length === 0)) return { books: [], total: 0 };

    const build = (head: boolean) => {
      let query = this.db.from("books").select(BOOK_COLUMNS, { count: "exact", head });
      if (statuses) query = query.in("status", statuses);
      if (ids) query = query.in("id", ids);
      if (excluded.length > 0) query = query.not("id", "in", `(${excluded.join(",")})`);
      if (filter.ageGroup) query = query.eq("age_group", filter.ageGroup);
      if (filter.category) query = query.contains("categories", arrayLiteral(filter.category));
      if (filter.theme) query = query.contains("themes", arrayLiteral(filter.theme));
      if (filter.tag) query = query.contains("tag_slugs", arrayLiteral(tagSlug(filter.tag)));
      if (filter.ownerId) query = query.eq("owner_id", filter.ownerId);
      if (filter.origin) query = query.eq("origin", filter.origin);
      switch (filter.timeBucket) {
        case "5":
          query = query.lte("reading_minutes", 5);
          break;
        case "10":
          query = query.gt("reading_minutes", 5).lte("reading_minutes", 10);
          break;
        case "15":
          query = query.gt("reading_minutes", 10).lte("reading_minutes", 15);
          break;
        case "20":
          query = query.gt("reading_minutes", 15);
          break;
        default:
      }
      for (const token of tokens) query = query.ilike("search_text", `%${token}%`);
      return query;
    };

    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit === undefined ? undefined : Math.max(0, filter.limit);

    const countOnly = async (): Promise<BookListResult> => {
      const { count, error } = await build(true);
      if (error) fail("count books", error);
      return { books: [], total: count ?? 0 };
    };
    if (limit === 0) return countOnly();

    let query = build(false);
    switch (filter.sort ?? "new") {
      case "popular":
        query = query.order("view_count", { ascending: false }).order("sort_date", { ascending: false });
        break;
      case "title":
        query = query.order("title", { ascending: true });
        break;
      case "updated":
        query = query.order("updated_at", { ascending: false });
        break;
      default:
        query = query.order("sort_date", { ascending: false }).order("title", { ascending: true });
    }
    query = query.order("id", { ascending: true });
    // Without an explicit limit PostgREST still caps a response at the
    // project's "max rows" setting (1000 by default).
    if (limit !== undefined) query = query.range(offset, offset + limit - 1);
    else if (offset > 0) query = query.range(offset, offset + 9999);

    const { data, count, error } = await query;
    if (error) {
      if (error.code === RANGE_NOT_SATISFIABLE) return countOnly();
      fail("list books", error);
    }
    const books = (data as unknown as BookRow[]).map(bookFromRow).filter((b): b is Book => b !== null);
    return { books, total: count ?? books.length };
  }

  async getBookById(id: string): Promise<BookWithPages | null> {
    if (!ID_PATTERN.test(id)) return null;
    return this.fetchBook("id", id);
  }

  async getBookBySlug(slug: string): Promise<BookWithPages | null> {
    if (!SLUG_PATTERN.test(slug)) return null;
    return this.fetchBook("slug", slug);
  }

  async listAllBooksWithPages(): Promise<BookWithPages[]> {
    // One request; the API's row cap (1000 by default) bounds it.
    const { data, error } = await this.db.from("books").select(BOOK_WITH_PAGES_COLUMNS);
    if (error) fail("read all books", error);
    return (data as unknown as BookRow[]).map(bookWithPagesFromRow).filter((book) => book !== null);
  }

  async getBookByShareToken(token: string): Promise<BookWithPages | null> {
    if (!token) return null;
    const { data, error } = await this.db.rpc("get_shared_book", { p_token: token });
    if (error) fail("read shared book", error);
    return data ? bookWithPagesFromRow(data as BookRow) : null;
  }

  async createBook(input: NewBookInput): Promise<BookWithPages> {
    const id = input.id ?? newId("bk");
    const pages = normalizePages(input.pages ?? []);
    const base = input.slug ?? (slugify(input.title) || `book-${newId()}`);
    const now = nowIso();
    const status = input.status ?? "draft";
    // clone() drops undefined values so they cannot override the defaults below.
    const fields: Partial<NewBookInput> = clone(input);
    delete fields.pages;

    for (let attempt = 0; ; attempt++) {
      const slug = await this.uniqueSlug(base);
      const book = BookWithPagesSchema.parse({
        summary: "",
        author: "",
        illustrator: "",
        license: "",
        source: "",
        ageGroup: "3-5",
        readingMinutes: estimateReadingMinutes(pages.map((p) => p.text)),
        coverImage: "",
        categories: [],
        tags: [],
        themes: [],
        discussionQuestions: [],
        origin: "manual",
        viewCount: 0,
        ...fields,
        title: input.title,
        ownerId: input.ownerId,
        id,
        slug,
        status,
        createdAt: now,
        updatedAt: now,
        publishedAt: input.publishedAt ?? (status === "published" ? now : undefined),
        pages,
      });
      const meta = toBook(book);

      const row: Record<string, unknown> = {
        tag_slugs: meta.tags.map(tagSlug),
        search_text: searchText(meta, book.pages.map((p) => p.text)),
      };
      for (const [key, value] of Object.entries(meta)) {
        row[BOOK_COLUMN_OF[key as keyof Book]] = value;
      }

      const { error } = await this.db.from("books").insert(row);
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          const text = `${error.message} ${error.details ?? ""}`;
          // Another request took the slug between the check and the insert.
          if (text.includes("slug") && attempt < 4) continue;
          if (text.includes("share_token")) throw new ConflictError("share token is already in use");
          throw new ConflictError(`book id ${id} already exists`);
        }
        fail("create book", error);
      }

      if (book.pages.length > 0) {
        try {
          await this.writePages(meta, book.pages, now);
        } catch (err) {
          await this.db.from("books").delete().eq("id", id);
          throw err;
        }
      }
      return clone(book);
    }
  }

  async updateBook(id: string, patch: BookPatch): Promise<Book> {
    const current = await this.getBookById(id);
    if (!current) throw new NotFoundError(`book ${id}`);

    const next: Book = { ...toBook(current), ...clone(patch), id, createdAt: current.createdAt };
    // A key explicitly set to undefined removes that (optional) field.
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete (next as Record<string, unknown>)[key];
    }
    delete (next as Record<string, unknown>).pages;
    next.updatedAt = nowIso();
    if (next.status === "published" && !next.publishedAt) next.publishedAt = next.updatedAt;
    if (next.slug !== current.slug && !SLUG_PATTERN.test(next.slug)) throw new Error(`invalid slug: ${next.slug}`);
    const valid = BookSchema.parse(next);

    const row: Record<string, unknown> = {
      updated_at: valid.updatedAt,
      published_at: valid.publishedAt ?? null,
      tag_slugs: valid.tags.map(tagSlug),
      search_text: searchText(valid, current.pages.map((p) => p.text)),
    };
    for (const key of Object.keys(patch) as (keyof Book)[]) {
      const column = BOOK_COLUMN_OF[key];
      if (!column || key === "id" || key === "createdAt" || key === "updatedAt") continue;
      // books.language is NOT NULL (default 'he'): removing the field means Hebrew.
      row[column] = valid[key] ?? (key === "language" ? "he" : null);
    }

    const { data, error } = await this.db.from("books").update(row).eq("id", id).select(BOOK_COLUMNS).maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const text = `${error.message} ${error.details ?? ""}`;
        throw new ConflictError(
          text.includes("share_token") ? "share token is already in use" : `slug ${valid.slug} is already taken`,
        );
      }
      fail("update book", error);
    }
    if (!data) throw new NotFoundError(`book ${id}`);
    const book = bookFromRow(data as unknown as BookRow);
    if (!book) throw new Error(`[supabase] book ${id} is invalid after update`);
    return book;
  }

  async deleteBook(id: string): Promise<void> {
    // Pages, favorites and progress cascade; a trigger removes the id from
    // collections and from the site settings.
    const { error } = await this.db.from("books").delete().eq("id", id);
    if (error) fail("delete book", error);
  }

  async replacePages(bookId: string, pages: Page[]): Promise<BookWithPages> {
    const current = await this.getBookById(bookId);
    if (!current) throw new NotFoundError(`book ${bookId}`);
    const nextPages = normalizePages(PageSchema.array().parse(clone(pages)));
    const updatedAt = nowIso();
    await this.writePages(toBook(current), nextPages, updatedAt);
    return { ...current, updatedAt, pages: nextPages };
  }

  async incrementViews(bookId: string): Promise<number> {
    const { data, error } = await this.db.rpc("increment_book_views", { p_book_id: bookId });
    if (error) fail("increment views", error);
    if (typeof data !== "number") throw new NotFoundError(`book ${bookId}`);
    return data;
  }

  // --- collections -----------------------------------------------------------------

  async listCollections(): Promise<Collection[]> {
    const { data, error } = await this.db
      .from("collections")
      .select(COLLECTION_COLUMNS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail("list collections", error);
    return (data as CollectionRow[]).map(collectionFromRow);
  }

  private async fetchCollection(column: "id" | "slug", value: string): Promise<Collection | null> {
    const { data, error } = await this.db
      .from("collections")
      .select(COLLECTION_COLUMNS)
      .eq(column, value)
      .maybeSingle();
    if (error) fail(`read collection by ${column}`, error);
    return data ? collectionFromRow(data as CollectionRow) : null;
  }

  getCollectionById(id: string): Promise<Collection | null> {
    return this.fetchCollection("id", id);
  }

  getCollectionBySlug(slug: string): Promise<Collection | null> {
    return this.fetchCollection("slug", slug);
  }

  async createCollection(input: NewCollectionInput): Promise<Collection> {
    const collections = await this.listCollections();
    const id = input.id ?? newId("col");
    if (collections.some((c) => c.id === id)) throw new ConflictError(`collection id ${id} already exists`);
    const base = input.slug ?? (slugify(input.title) || `collection-${newId()}`);
    let slug = base;
    for (let n = 2; collections.some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
    const collection = CollectionSchema.parse({ ...input, id, slug });
    const { error } = await this.db.from("collections").insert({
      id: collection.id,
      slug: collection.slug,
      title: collection.title,
      description: collection.description,
      book_ids: collection.bookIds,
      season: collection.season ?? null,
    });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ConflictError(`collection ${id} or slug ${slug} already exists`);
      fail("create collection", error);
    }
    return collection;
  }

  async updateCollection(id: string, patch: CollectionPatch): Promise<Collection> {
    const current = await this.getCollectionById(id);
    if (!current) throw new NotFoundError(`collection ${id}`);
    const next = CollectionSchema.parse({ ...current, ...patch, id });
    const { data, error } = await this.db
      .from("collections")
      .update({
        slug: next.slug,
        title: next.title,
        description: next.description,
        book_ids: next.bookIds,
        season: next.season ?? null,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ConflictError(`slug ${next.slug} is already taken`);
      fail("update collection", error);
    }
    if (!data) throw new NotFoundError(`collection ${id}`);
    return next;
  }

  async deleteCollection(id: string): Promise<void> {
    const { error } = await this.db.from("collections").delete().eq("id", id);
    if (error) fail("delete collection", error);
  }

  // --- settings ------------------------------------------------------------------------

  async getSettings(): Promise<SiteSettings> {
    const { data, error } = await this.db.from("site_settings").select("data").eq("id", true).maybeSingle();
    if (error) fail("read settings", error);
    const parsed = SiteSettingsSchema.safeParse((data as { data: unknown } | null)?.data ?? {});
    return parsed.success ? parsed.data : {};
  }

  async setSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
    const merged: SiteSettings = { ...(await this.getSettings()), ...patch, updatedAt: nowIso() };
    const next = SiteSettingsSchema.parse(clone(merged));
    const { error } = await this.db
      .from("site_settings")
      .upsert({ id: true, data: next, updated_at: next.updatedAt }, { onConflict: "id" });
    if (error) fail("write settings", error);
    return next;
  }

  // --- favorites -------------------------------------------------------------------------

  async addFavorite(userId: string, bookId: string): Promise<Favorite> {
    const { error } = await this.db
      .from("favorites")
      .upsert(
        { user_id: userId, book_id: bookId, created_at: nowIso() },
        { onConflict: "user_id,book_id", ignoreDuplicates: true },
      );
    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) throw new NotFoundError(`book ${bookId}`);
      fail("add favorite", error);
    }
    const { data, error: readError } = await this.db
      .from("favorites")
      .select("user_id,book_id,created_at")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();
    if (readError) fail("read favorite", readError);
    if (!data) throw new NotFoundError(`favorite ${userId}/${bookId}`);
    return favoriteFromRow(data as FavoriteRow);
  }

  async removeFavorite(userId: string, bookId: string): Promise<void> {
    const { error } = await this.db.from("favorites").delete().eq("user_id", userId).eq("book_id", bookId);
    if (error) fail("remove favorite", error);
  }

  async listFavorites(userId: string): Promise<Favorite[]> {
    const { data, error } = await this.db
      .from("favorites")
      .select("user_id,book_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) fail("list favorites", error);
    return (data as FavoriteRow[]).map(favoriteFromRow);
  }

  async isFavorite(userId: string, bookId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("favorites")
      .select("book_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("book_id", bookId);
    if (error) fail("read favorite", error);
    return (count ?? 0) > 0;
  }

  // --- ratings -----------------------------------------------------------------------------

  async setRating(userId: string, bookId: string, stars: number): Promise<Rating> {
    const { data, error } = await this.db
      .from("ratings")
      .upsert(
        { user_id: userId, book_id: bookId, stars, updated_at: nowIso() },
        { onConflict: "user_id,book_id" },
      )
      .select("user_id,book_id,stars,created_at,updated_at")
      .single();
    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) throw new NotFoundError(`book ${bookId}`);
      fail("set rating", error);
    }
    return ratingFromRow(data as RatingRow);
  }

  async removeRating(userId: string, bookId: string): Promise<void> {
    const { error } = await this.db.from("ratings").delete().eq("user_id", userId).eq("book_id", bookId);
    if (error) fail("remove rating", error);
  }

  async getRating(userId: string, bookId: string): Promise<Rating | null> {
    const { data, error } = await this.db
      .from("ratings")
      .select("user_id,book_id,stars,created_at,updated_at")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();
    if (error) fail("read rating", error);
    return data ? ratingFromRow(data as RatingRow) : null;
  }

  async getRatingSummary(bookId: string): Promise<RatingSummary> {
    const { data, error } = await this.db.from("ratings").select("stars").eq("book_id", bookId).limit(100000);
    if (error) fail("read ratings", error);
    const rows = (data ?? []) as { stars: number }[];
    if (!rows.length) return { average: 0, count: 0 };
    return { average: rows.reduce((sum, r) => sum + r.stars, 0) / rows.length, count: rows.length };
  }

  // --- waiting list ------------------------------------------------------------------------

  async addWaitlistEntry(
    email: string,
    interests: WaitlistInterest[],
  ): Promise<{ entry: WaitlistEntry; created: boolean }> {
    const key = email.trim().toLowerCase();
    const { data: existing, error: readError } = await this.db
      .from("waitlist")
      .select("email,interests,created_at")
      .eq("email", key)
      .maybeSingle();
    if (readError) fail("read waitlist entry", readError);
    const row = existing as { email: string; interests: string[]; created_at: string } | null;
    const merged = [...new Set([...(row?.interests ?? []), ...interests])];
    const { data, error } = await this.db
      .from("waitlist")
      .upsert({ email: key, interests: merged }, { onConflict: "email" })
      .select("email,interests,created_at")
      .single();
    if (error) fail("add waitlist entry", error);
    const saved = data as { email: string; interests: string[]; created_at: string };
    return {
      entry: WaitlistEntrySchema.parse({ email: saved.email, interests: saved.interests, createdAt: iso(saved.created_at) }),
      created: !row,
    };
  }

  async listWaitlist(): Promise<WaitlistEntry[]> {
    const { data, error } = await this.db
      .from("waitlist")
      .select("email,interests,created_at")
      .order("created_at", { ascending: true })
      .limit(100000);
    if (error) fail("list waitlist", error);
    return ((data ?? []) as { email: string; interests: string[]; created_at: string }[]).map((row) =>
      WaitlistEntrySchema.parse({ email: row.email, interests: row.interests, createdAt: iso(row.created_at) }),
    );
  }

  // --- progress ----------------------------------------------------------------------------

  async getProgress(userId: string, bookId: string): Promise<Progress | null> {
    const { data, error } = await this.db
      .from("reading_progress")
      .select("user_id,book_id,page_index,completed,updated_at")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();
    if (error) fail("read progress", error);
    return data ? progressFromRow(data as ProgressRow) : null;
  }

  async setProgress(userId: string, bookId: string, pageIndex: number, completed?: boolean): Promise<Progress> {
    const existing = completed === undefined ? await this.getProgress(userId, bookId) : null;
    const next = ProgressSchema.parse({
      userId,
      bookId,
      pageIndex,
      completed: completed ?? existing?.completed ?? false,
      updatedAt: nowIso(),
    });
    const { error } = await this.db.from("reading_progress").upsert(
      {
        user_id: next.userId,
        book_id: next.bookId,
        page_index: next.pageIndex,
        completed: next.completed,
        updated_at: next.updatedAt,
      },
      { onConflict: "user_id,book_id" },
    );
    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) throw new NotFoundError(`book ${bookId}`);
      fail("write progress", error);
    }
    return next;
  }

  async listProgress(userId: string): Promise<Progress[]> {
    const { data, error } = await this.db
      .from("reading_progress")
      .select("user_id,book_id,page_index,completed,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) fail("list progress", error);
    return (data as ProgressRow[]).map(progressFromRow);
  }

  // --- family recordings ---------------------------------------------------------------------

  async listRecordings(filter: RecordingFilter = {}): Promise<Recording[]> {
    let query = this.db.from("recordings").select(RECORDING_COLUMNS);
    if (filter.userId !== undefined) query = query.eq("user_id", filter.userId);
    if (filter.bookId !== undefined) query = query.eq("book_id", filter.bookId);
    if (filter.status !== undefined) query = query.eq("status", filter.status);
    const { data, error } = await query.order("updated_at", {
      ascending: false,
    });
    if (error) fail("list recordings", error);
    return (data as RecordingRow[]).map(recordingFromRow).filter((r): r is Recording => r !== null);
  }

  async getRecording(id: string): Promise<Recording | null> {
    const { data, error } = await this.db.from("recordings").select(RECORDING_COLUMNS).eq("id", id).maybeSingle();
    if (error) fail("read recording", error);
    return data ? recordingFromRow(data as RecordingRow) : null;
  }

  async createRecording(input: NewRecordingInput): Promise<Recording> {
    const now = nowIso();
    const recording = RecordingSchema.parse({
      id: newId(),
      bookId: input.bookId,
      userId: input.userId,
      title: input.title,
      status: "private",
      pages: [],
      createdAt: now,
      updatedAt: now,
    });
    const { error } = await this.db.from("recordings").insert({
      id: recording.id,
      book_id: recording.bookId,
      user_id: recording.userId,
      title: recording.title,
      status: recording.status,
      pages: recording.pages,
      created_at: recording.createdAt,
      updated_at: recording.updatedAt,
    });
    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) throw new NotFoundError(`book ${input.bookId}`);
      fail("create recording", error);
    }
    return recording;
  }

  async updateRecording(id: string, patch: RecordingPatch): Promise<Recording> {
    const current = await this.getRecording(id);
    if (!current) throw new NotFoundError(`recording ${id} not found`);
    const merged: Record<string, unknown> = { ...current, updatedAt: nowIso() };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    const next = RecordingSchema.parse(merged);
    const { error } = await this.db
      .from("recordings")
      .update({
        title: next.title,
        status: next.status,
        review_note: next.reviewNote ?? null,
        pages: next.pages,
        updated_at: next.updatedAt,
        submitted_at: next.submittedAt ?? null,
      })
      .eq("id", id);
    if (error) fail("update recording", error);
    return next;
  }

  async deleteRecording(id: string): Promise<void> {
    const { error } = await this.db.from("recordings").delete().eq("id", id);
    if (error) fail("delete recording", error);
  }

  // --- users -----------------------------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    const { data, error } = await this.db
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail("list users", error);
    return (data as ProfileRow[]).map(userFromRow).filter((u): u is User => u !== null);
  }

  async getUser(id: string): Promise<User | null> {
    if (!ID_PATTERN.test(id)) return null;
    const { data, error } = await this.db.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (error) fail("read user", error);
    return data ? userFromRow(data as ProfileRow) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const wanted = email.trim().toLowerCase();
    if (!wanted) return null;
    // Emails are stored lowercased by upsertUser() and by the signup trigger.
    const { data, error } = await this.db
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("email", wanted)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) fail("read user by email", error);
    const row = (data as ProfileRow[])[0];
    return row ? userFromRow(row) : null;
  }

  async upsertUser(input: UpsertUserInput): Promise<User> {
    const email = input.email?.trim().toLowerCase() || undefined;
    const existing = input.id
      ? await this.getUser(input.id)
      : email !== undefined
        ? await this.getUserByEmail(email)
        : null;
    const user = UserSchema.parse(
      compact({
        id: existing?.id ?? input.id ?? newId("u"),
        name: input.name.trim() || existing?.name || "אורח",
        email: email ?? existing?.email,
        role: input.role ?? existing?.role ?? "parent",
        createdAt: existing?.createdAt ?? nowIso(),
      }),
    );
    const { error } = await this.db.from("profiles").upsert(
      {
        id: user.id,
        name: user.name,
        email: user.email ?? null,
        role: user.role,
        created_at: user.createdAt,
      },
      { onConflict: "id" },
    );
    if (error) fail("write user", error);
    return user;
  }

  async setUserRole(id: string, role: UserRole): Promise<User> {
    const { data, error } = await this.db
      .from("profiles")
      .update({ role })
      .eq("id", id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) fail("write user role", error);
    const user = data ? userFromRow(data as ProfileRow) : null;
    if (!user) throw new NotFoundError(`user ${id}`);
    return user;
  }

  // --- jobs ----------------------------------------------------------------------------------------

  async createJob(input: NewJobInput): Promise<GenerationJob> {
    const now = nowIso();
    const job = GenerationJobSchema.parse(
      ({
        status: "queued",
        step: "queued",
        progress: 0,
        ...clone(input),
        id: input.id ?? newId("job"),
        createdAt: now,
        updatedAt: now,
      }),
    );
    const { error } = await this.db.from("generation_jobs").insert(jobToRow(job));
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ConflictError(`job id ${job.id} already exists`);
      fail("create job", error);
    }
    return job;
  }

  async getJob(id: string): Promise<GenerationJob | null> {
    const { data, error } = await this.db.from("generation_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
    if (error) fail("read job", error);
    return data ? jobFromRow(data as JobRow) : null;
  }

  async updateJob(id: string, patch: JobPatch): Promise<GenerationJob> {
    const current = await this.getJob(id);
    if (!current) throw new NotFoundError(`job ${id}`);
    const merged = { ...current, ...patch, id, ownerId: current.ownerId, createdAt: current.createdAt };
    const next = GenerationJobSchema.parse(clone({ ...merged, updatedAt: nowIso() }));
    const { id: _id, owner_id: _owner, created_at: _created, ...columns } = jobToRow(next);
    const { data, error } = await this.db
      .from("generation_jobs")
      .update(columns)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) fail("update job", error);
    if (!data) throw new NotFoundError(`job ${id}`);
    return next;
  }

  async listJobs(filter: JobFilter = {}): Promise<GenerationJob[]> {
    let query = this.db.from("generation_jobs").select(JOB_COLUMNS);
    if (filter.ownerId) query = query.eq("owner_id", filter.ownerId);
    if (filter.status) query = query.in("status", Array.isArray(filter.status) ? filter.status : [filter.status]);
    if (filter.kind) query = query.eq("kind", filter.kind);
    query = query.order("created_at", { ascending: false }).order("id", { ascending: true });
    if (filter.limit !== undefined) query = query.limit(Math.max(0, filter.limit));
    const { data, error } = await query;
    if (error) fail("list jobs", error);
    return (data as JobRow[]).map(jobFromRow);
  }

  async deleteJob(id: string): Promise<void> {
    const { error } = await this.db.from("generation_jobs").delete().eq("id", id);
    if (error) fail("delete job", error);
  }

  async countWeeklyGenerations(ownerId: string, since?: Date): Promise<number> {
    const from = (since ?? new Date(Date.now() - WEEK_MS)).toISOString();
    const { count, error } = await this.db
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .neq("status", "failed")
      .gte("created_at", from);
    if (error) fail("count jobs", error);
    return count ?? 0;
  }
}
