/**
 * LocalRepository: JSON files under the data directory.
 *
 *   data/books/<slug>/book.json   one BookWithPages per folder
 *   data/collections.json         Collection[]
 *   data/settings.json            SiteSettings
 *   data/users.json               User[]
 *   data/favorites.json           Favorite[]
 *   data/progress.json            Progress[]
 *   data/recordings.json          Recording[]
 *   data/jobs.json                GenerationJob[]
 *
 * Writes are atomic (temp file + rename) and serialized by an in-process mutex.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { estimateReadingMinutes, normalizeForSearch, slugify } from "../hebrew";
import { newId } from "../ids";
import { categoryLabel, readingTimeBucket, tagSlug, themeLabel } from "../taxonomy";
import {
  BookWithPagesSchema,
  CollectionSchema,
  FavoriteSchema,
  GenerationJobSchema,
  ProgressSchema,
  RecordingSchema,
  SiteSettingsSchema,
  SLUG_PATTERN,
  UserSchema,
  type Book,
  type BookWithPages,
  type Collection,
  type Favorite,
  type GenerationJob,
  type Page,
  type Progress,
  type Recording,
  type SiteSettings,
  type User,
  type UserRole,
} from "../types";
import { isNotFound, Mutex, readJson, renameDir, writeJsonAtomic } from "./fs-util";
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

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toBook(full: BookWithPages): Book {
  const copy: Partial<BookWithPages> = clone(full);
  delete copy.pages;
  return copy as Book;
}

function normalizePages(pages: Page[]): Page[] {
  return pages.map((page, index) => ({ ...page, index }));
}

function sortKeyNew(book: Book): string {
  return book.publishedAt ?? book.createdAt;
}

interface CachedBook {
  mtimeMs: number;
  size: number;
  book: BookWithPages;
  haystack?: string;
}

export class LocalRepository implements Repository {
  readonly kind = "local" as const;
  private readonly mutex = new Mutex();
  private readonly bookCache = new Map<string, CachedBook>();

  constructor(private readonly root: string) {}

  // --- paths ---------------------------------------------------------------

  private booksDir(): string {
    return path.join(this.root, "books");
  }

  private bookFile(slug: string): string {
    if (!SLUG_PATTERN.test(slug)) throw new Error(`invalid slug: ${slug}`);
    return path.join(this.booksDir(), slug, "book.json");
  }

  private file(name: string): string {
    return path.join(this.root, name);
  }

  // --- generic list files ----------------------------------------------------

  private async readList<T>(name: string, schema: z.ZodType<T>): Promise<T[]> {
    const raw = await readJson(this.file(name));
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) throw new Error(`${name} must contain a JSON array`);
    const items: T[] = [];
    for (const entry of raw) {
      const parsed = schema.safeParse(entry);
      if (parsed.success) items.push(parsed.data);
      else console.warn(`[repo] skipping invalid entry in ${name}: ${parsed.error.message}`);
    }
    return items;
  }

  private async writeList<T>(name: string, items: T[]): Promise<void> {
    await writeJsonAtomic(this.file(name), items);
  }

  // --- books: loading --------------------------------------------------------

  private async loadAllBooks(): Promise<CachedBook[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.booksDir());
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
    const seen = new Set<string>();
    const result: CachedBook[] = [];
    for (const slug of entries) {
      if (!SLUG_PATTERN.test(slug)) continue;
      const file = path.join(this.booksDir(), slug, "book.json");
      let stat;
      try {
        stat = await fs.stat(file);
      } catch (err) {
        if (isNotFound(err)) continue;
        throw err;
      }
      seen.add(slug);
      const cached = this.bookCache.get(slug);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        result.push(cached);
        continue;
      }
      try {
        const parsed = BookWithPagesSchema.safeParse(await readJson(file));
        if (!parsed.success) {
          console.warn(`[repo] skipping invalid book ${slug}: ${parsed.error.message}`);
          continue;
        }
        if (parsed.data.slug !== slug) {
          console.warn(`[repo] skipping book ${slug}: folder name differs from slug ${parsed.data.slug}`);
          continue;
        }
        const entry: CachedBook = { mtimeMs: stat.mtimeMs, size: stat.size, book: parsed.data };
        this.bookCache.set(slug, entry);
        result.push(entry);
      } catch (err) {
        console.warn(`[repo] skipping unreadable book ${slug}: ${String(err)}`);
      }
    }
    for (const slug of this.bookCache.keys()) {
      if (!seen.has(slug)) this.bookCache.delete(slug);
    }
    return result;
  }

  private async findById(id: string): Promise<BookWithPages | null> {
    const all = await this.loadAllBooks();
    return all.find((entry) => entry.book.id === id)?.book ?? null;
  }

  private async mustFindById(id: string): Promise<BookWithPages> {
    const book = await this.findById(id);
    if (!book) throw new NotFoundError(`book ${id}`);
    return book;
  }

  private async writeBook(book: BookWithPages): Promise<BookWithPages> {
    const valid = BookWithPagesSchema.parse({ ...book, pages: normalizePages(book.pages) });
    await writeJsonAtomic(this.bookFile(valid.slug), valid);
    this.bookCache.delete(valid.slug);
    return valid;
  }

  private haystack(entry: CachedBook): string {
    if (entry.haystack === undefined) {
      const b = entry.book;
      entry.haystack = normalizeForSearch(
        [
          b.title,
          b.summary,
          b.author,
          b.illustrator,
          ...b.tags,
          ...b.categories.map(categoryLabel),
          ...b.themes.map(themeLabel),
          ...b.pages.map((p) => p.text),
        ].join(" "),
      );
    }
    return entry.haystack;
  }

  private async uniqueSlug(base: string, ignoreBookId?: string): Promise<string> {
    const all = await this.loadAllBooks();
    const taken = new Set(all.filter((e) => e.book.id !== ignoreBookId).map((e) => e.book.slug));
    // Folders without a valid book.json still occupy the name.
    try {
      for (const name of await fs.readdir(this.booksDir())) {
        const owner = all.find((e) => e.book.slug === name);
        if (!owner || owner.book.id !== ignoreBookId) taken.add(name);
      }
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base.slice(0, 70)}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // --- books: public API -------------------------------------------------------

  async listBooks(filter: BookFilter = {}): Promise<BookListResult> {
    const all = await this.loadAllBooks();
    const statuses =
      filter.status === "any"
        ? null
        : Array.isArray(filter.status)
          ? filter.status
          : [filter.status ?? "published"];
    const tokens = filter.query ? normalizeForSearch(filter.query).split(" ").filter(Boolean) : [];
    const wantedTag = filter.tag ? tagSlug(filter.tag) : null;
    const ids = filter.ids ? new Set(filter.ids) : null;
    const excluded = filter.excludeIds ? new Set(filter.excludeIds) : null;

    const matches = all.filter((entry) => {
      const b = entry.book;
      if (statuses && !statuses.includes(b.status)) return false;
      if (ids && !ids.has(b.id)) return false;
      if (excluded && excluded.has(b.id)) return false;
      if (filter.ageGroup && b.ageGroup !== filter.ageGroup) return false;
      if (filter.category && !b.categories.includes(filter.category)) return false;
      if (filter.theme && !b.themes.includes(filter.theme)) return false;
      if (filter.ownerId && b.ownerId !== filter.ownerId) return false;
      if (filter.origin && b.origin !== filter.origin) return false;
      if (filter.timeBucket && readingTimeBucket(b.readingMinutes) !== filter.timeBucket) return false;
      if (wantedTag && !b.tags.some((t) => tagSlug(t) === wantedTag)) return false;
      if (tokens.length > 0) {
        const hay = this.haystack(entry);
        if (!tokens.every((token) => hay.includes(token))) return false;
      }
      return true;
    });

    const books = matches.map((entry) => toBook(entry.book));
    const byNew = (a: Book, b: Book) => sortKeyNew(b).localeCompare(sortKeyNew(a));
    switch (filter.sort ?? "new") {
      case "popular":
        books.sort((a, b) => b.viewCount - a.viewCount || byNew(a, b));
        break;
      case "title":
        books.sort((a, b) => a.title.localeCompare(b.title, "he"));
        break;
      case "updated":
        books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        break;
      default:
        books.sort((a, b) => byNew(a, b) || a.title.localeCompare(b.title, "he"));
    }

    const offset = Math.max(0, filter.offset ?? 0);
    const end = filter.limit === undefined ? undefined : offset + Math.max(0, filter.limit);
    return { books: books.slice(offset, end), total: books.length };
  }

  async getBookById(id: string): Promise<BookWithPages | null> {
    const book = await this.findById(id);
    return book ? clone(book) : null;
  }

  async listAllBooksWithPages(): Promise<BookWithPages[]> {
    return (await this.loadAllBooks()).map((entry) => clone(entry.book));
  }

  async getBookBySlug(slug: string): Promise<BookWithPages | null> {
    if (!SLUG_PATTERN.test(slug)) return null;
    const all = await this.loadAllBooks();
    const book = all.find((entry) => entry.book.slug === slug)?.book;
    return book ? clone(book) : null;
  }

  async getBookByShareToken(token: string): Promise<BookWithPages | null> {
    if (!token) return null;
    const all = await this.loadAllBooks();
    const book = all.find((entry) => entry.book.shareToken === token)?.book;
    return book ? clone(book) : null;
  }

  createBook(input: NewBookInput): Promise<BookWithPages> {
    return this.mutex.run(async () => {
      const id = input.id ?? newId("bk");
      if (await this.findById(id)) throw new ConflictError(`book id ${id} already exists`);
      const pages = normalizePages(input.pages ?? []);
      const base = input.slug ?? (slugify(input.title) || `book-${newId()}`);
      const slug = await this.uniqueSlug(base);
      const now = nowIso();
      const status = input.status ?? "draft";
      // clone() drops undefined values so they cannot override the defaults below.
      const fields: Partial<NewBookInput> = clone(input);
      delete fields.pages;
      const book: BookWithPages = {
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
      };
      return clone(await this.writeBook(book));
    });
  }

  updateBook(id: string, patch: BookPatch): Promise<Book> {
    return this.mutex.run(async () => {
      const current = await this.mustFindById(id);
      const next: BookWithPages = { ...clone(current), ...clone(patch), id, createdAt: current.createdAt };
      // A key explicitly set to undefined removes that (optional) field.
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete (next as Record<string, unknown>)[key];
      }
      next.pages = current.pages;
      next.updatedAt = nowIso();
      if (next.status === "published" && !next.publishedAt) next.publishedAt = next.updatedAt;

      if (next.slug !== current.slug) {
        if (!SLUG_PATTERN.test(next.slug)) throw new Error(`invalid slug: ${next.slug}`);
        const unique = await this.uniqueSlug(next.slug, id);
        if (unique !== next.slug) throw new ConflictError(`slug ${next.slug} is already taken`);
        BookWithPagesSchema.parse(next);
        await renameDir(path.dirname(this.bookFile(current.slug)), path.dirname(this.bookFile(next.slug)));
        this.bookCache.delete(current.slug);
      }
      return toBook(await this.writeBook(next));
    });
  }

  deleteBook(id: string): Promise<void> {
    return this.mutex.run(async () => {
      const current = await this.findById(id);
      if (current) {
        await fs.rm(path.dirname(this.bookFile(current.slug)), { recursive: true, force: true });
        this.bookCache.delete(current.slug);
      }
      const favorites = await this.readList("favorites.json", FavoriteSchema);
      if (favorites.some((f) => f.bookId === id)) {
        await this.writeList("favorites.json", favorites.filter((f) => f.bookId !== id));
      }
      const progress = await this.readList("progress.json", ProgressSchema);
      if (progress.some((p) => p.bookId === id)) {
        await this.writeList("progress.json", progress.filter((p) => p.bookId !== id));
      }
      const recordings = await this.readList("recordings.json", RecordingSchema);
      if (recordings.some((r) => r.bookId === id)) {
        await this.writeList(
          "recordings.json",
          recordings.filter((r) => r.bookId !== id),
        );
      }
      const collections = await this.readList("collections.json", CollectionSchema);
      if (collections.some((c) => c.bookIds.includes(id))) {
        await this.writeList(
          "collections.json",
          collections.map((c) => ({ ...c, bookIds: c.bookIds.filter((b) => b !== id) })),
        );
      }
      const settings = await this.readSettings();
      if (settings.bookOfTheWeekId === id) {
        delete settings.bookOfTheWeekId;
        await writeJsonAtomic(this.file("settings.json"), settings);
      }
    });
  }

  replacePages(bookId: string, pages: Page[]): Promise<BookWithPages> {
    return this.mutex.run(async () => {
      const current = await this.mustFindById(bookId);
      const next: BookWithPages = { ...clone(current), pages: normalizePages(clone(pages)), updatedAt: nowIso() };
      return clone(await this.writeBook(next));
    });
  }

  incrementViews(bookId: string): Promise<number> {
    return this.mutex.run(async () => {
      const current = await this.mustFindById(bookId);
      const next: BookWithPages = { ...clone(current), viewCount: current.viewCount + 1 };
      await this.writeBook(next);
      return next.viewCount;
    });
  }

  // --- collections -----------------------------------------------------------

  async listCollections(): Promise<Collection[]> {
    return this.readList("collections.json", CollectionSchema);
  }

  async getCollectionById(id: string): Promise<Collection | null> {
    return (await this.listCollections()).find((c) => c.id === id) ?? null;
  }

  async getCollectionBySlug(slug: string): Promise<Collection | null> {
    return (await this.listCollections()).find((c) => c.slug === slug) ?? null;
  }

  createCollection(input: NewCollectionInput): Promise<Collection> {
    return this.mutex.run(async () => {
      const collections = await this.listCollections();
      const id = input.id ?? newId("col");
      if (collections.some((c) => c.id === id)) throw new ConflictError(`collection id ${id} already exists`);
      const base = input.slug ?? (slugify(input.title) || `collection-${newId()}`);
      let slug = base;
      for (let n = 2; collections.some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
      const collection = CollectionSchema.parse({ ...input, id, slug });
      await this.writeList("collections.json", [...collections, collection]);
      return collection;
    });
  }

  updateCollection(id: string, patch: CollectionPatch): Promise<Collection> {
    return this.mutex.run(async () => {
      const collections = await this.listCollections();
      const index = collections.findIndex((c) => c.id === id);
      if (index < 0) throw new NotFoundError(`collection ${id}`);
      const next = CollectionSchema.parse({ ...collections[index], ...patch, id });
      if (collections.some((c, i) => i !== index && c.slug === next.slug)) {
        throw new ConflictError(`slug ${next.slug} is already taken`);
      }
      collections[index] = next;
      await this.writeList("collections.json", collections);
      return next;
    });
  }

  deleteCollection(id: string): Promise<void> {
    return this.mutex.run(async () => {
      const collections = await this.listCollections();
      await this.writeList("collections.json", collections.filter((c) => c.id !== id));
    });
  }

  // --- settings ----------------------------------------------------------------

  private async readSettings(): Promise<SiteSettings> {
    const raw = await readJson(this.file("settings.json"));
    const parsed = SiteSettingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : {};
  }

  async getSettings(): Promise<SiteSettings> {
    return this.readSettings();
  }

  setSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
    return this.mutex.run(async () => {
      const merged: SiteSettings = { ...(await this.readSettings()), ...patch, updatedAt: nowIso() };
      const next = SiteSettingsSchema.parse(JSON.parse(JSON.stringify(merged)));
      await writeJsonAtomic(this.file("settings.json"), next);
      return next;
    });
  }

  // --- favorites -----------------------------------------------------------------

  addFavorite(userId: string, bookId: string): Promise<Favorite> {
    return this.mutex.run(async () => {
      const favorites = await this.readList("favorites.json", FavoriteSchema);
      const existing = favorites.find((f) => f.userId === userId && f.bookId === bookId);
      if (existing) return existing;
      const favorite: Favorite = { userId, bookId, createdAt: nowIso() };
      await this.writeList("favorites.json", [...favorites, favorite]);
      return favorite;
    });
  }

  removeFavorite(userId: string, bookId: string): Promise<void> {
    return this.mutex.run(async () => {
      const favorites = await this.readList("favorites.json", FavoriteSchema);
      await this.writeList(
        "favorites.json",
        favorites.filter((f) => !(f.userId === userId && f.bookId === bookId)),
      );
    });
  }

  async listFavorites(userId: string): Promise<Favorite[]> {
    const favorites = await this.readList("favorites.json", FavoriteSchema);
    return favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async isFavorite(userId: string, bookId: string): Promise<boolean> {
    const favorites = await this.readList("favorites.json", FavoriteSchema);
    return favorites.some((f) => f.userId === userId && f.bookId === bookId);
  }

  // --- progress ------------------------------------------------------------------

  async getProgress(userId: string, bookId: string): Promise<Progress | null> {
    const all = await this.readList("progress.json", ProgressSchema);
    return all.find((p) => p.userId === userId && p.bookId === bookId) ?? null;
  }

  setProgress(userId: string, bookId: string, pageIndex: number, completed?: boolean): Promise<Progress> {
    return this.mutex.run(async () => {
      const all = await this.readList("progress.json", ProgressSchema);
      const existing = all.find((p) => p.userId === userId && p.bookId === bookId);
      const next = ProgressSchema.parse({
        userId,
        bookId,
        pageIndex,
        completed: completed ?? existing?.completed ?? false,
        updatedAt: nowIso(),
      });
      await this.writeList("progress.json", [
        ...all.filter((p) => !(p.userId === userId && p.bookId === bookId)),
        next,
      ]);
      return next;
    });
  }

  async listProgress(userId: string): Promise<Progress[]> {
    const all = await this.readList("progress.json", ProgressSchema);
    return all.filter((p) => p.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // --- family recordings -------------------------------------------------------

  async listRecordings(filter: RecordingFilter = {}): Promise<Recording[]> {
    const all = await this.readList("recordings.json", RecordingSchema);
    return all
      .filter(
        (r) =>
          (filter.userId === undefined || r.userId === filter.userId) &&
          (filter.bookId === undefined || r.bookId === filter.bookId) &&
          (filter.status === undefined || r.status === filter.status),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getRecording(id: string): Promise<Recording | null> {
    const all = await this.readList("recordings.json", RecordingSchema);
    return all.find((r) => r.id === id) ?? null;
  }

  createRecording(input: NewRecordingInput): Promise<Recording> {
    return this.mutex.run(async () => {
      const all = await this.readList("recordings.json", RecordingSchema);
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
      await this.writeList("recordings.json", [...all, recording]);
      return recording;
    });
  }

  updateRecording(id: string, patch: RecordingPatch): Promise<Recording> {
    return this.mutex.run(async () => {
      const all = await this.readList("recordings.json", RecordingSchema);
      const current = all.find((r) => r.id === id);
      if (!current) throw new NotFoundError(`recording ${id} not found`);
      const merged: Record<string, unknown> = {
        ...current,
        updatedAt: nowIso(),
      };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete merged[key];
        else merged[key] = value;
      }
      const next = RecordingSchema.parse(merged);
      await this.writeList(
        "recordings.json",
        all.map((r) => (r.id === id ? next : r)),
      );
      return next;
    });
  }

  deleteRecording(id: string): Promise<void> {
    return this.mutex.run(async () => {
      const all = await this.readList("recordings.json", RecordingSchema);
      if (all.some((r) => r.id === id)) {
        await this.writeList(
          "recordings.json",
          all.filter((r) => r.id !== id),
        );
      }
    });
  }

  // --- users ---------------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    return this.readList("users.json", UserSchema);
  }

  async getUser(id: string): Promise<User | null> {
    return (await this.listUsers()).find((u) => u.id === id) ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const wanted = email.trim().toLowerCase();
    if (!wanted) return null;
    return (await this.listUsers()).find((u) => u.email?.toLowerCase() === wanted) ?? null;
  }

  upsertUser(input: UpsertUserInput): Promise<User> {
    return this.mutex.run(async () => {
      const users = await this.listUsers();
      const email = input.email?.trim().toLowerCase() || undefined;
      const index = users.findIndex((u) =>
        input.id ? u.id === input.id : email !== undefined && u.email?.toLowerCase() === email,
      );
      const existing = index >= 0 ? users[index] : undefined;
      const user = UserSchema.parse({
        id: existing?.id ?? input.id ?? newId("u"),
        name: input.name.trim() || existing?.name || "אורח",
        email: email ?? existing?.email,
        role: input.role ?? existing?.role ?? "parent",
        createdAt: existing?.createdAt ?? nowIso(),
      });
      if (index >= 0) users[index] = user;
      else users.push(user);
      await this.writeList("users.json", users);
      return user;
    });
  }

  setUserRole(id: string, role: UserRole): Promise<User> {
    return this.mutex.run(async () => {
      const users = await this.listUsers();
      const index = users.findIndex((u) => u.id === id);
      if (index < 0) throw new NotFoundError(`user ${id}`);
      users[index] = UserSchema.parse({ ...users[index], role });
      await this.writeList("users.json", users);
      return users[index];
    });
  }

  // --- jobs ------------------------------------------------------------------------

  createJob(input: NewJobInput): Promise<GenerationJob> {
    return this.mutex.run(async () => {
      const jobs = await this.readList("jobs.json", GenerationJobSchema);
      const now = nowIso();
      const job = GenerationJobSchema.parse({
        status: "queued",
        step: "queued",
        progress: 0,
        ...input,
        id: input.id ?? newId("job"),
        createdAt: now,
        updatedAt: now,
      });
      if (jobs.some((j) => j.id === job.id)) throw new ConflictError(`job id ${job.id} already exists`);
      await this.writeList("jobs.json", [...jobs, job]);
      return job;
    });
  }

  async getJob(id: string): Promise<GenerationJob | null> {
    const jobs = await this.readList("jobs.json", GenerationJobSchema);
    return jobs.find((j) => j.id === id) ?? null;
  }

  updateJob(id: string, patch: JobPatch): Promise<GenerationJob> {
    return this.mutex.run(async () => {
      const jobs = await this.readList("jobs.json", GenerationJobSchema);
      const index = jobs.findIndex((j) => j.id === id);
      if (index < 0) throw new NotFoundError(`job ${id}`);
      const merged = { ...jobs[index], ...patch, id, updatedAt: nowIso() };
      jobs[index] = GenerationJobSchema.parse(JSON.parse(JSON.stringify(merged)));
      await this.writeList("jobs.json", jobs);
      return jobs[index];
    });
  }

  async listJobs(filter: JobFilter = {}): Promise<GenerationJob[]> {
    const statuses = filter.status ? (Array.isArray(filter.status) ? filter.status : [filter.status]) : null;
    const jobs = (await this.readList("jobs.json", GenerationJobSchema))
      .filter((j) => !filter.ownerId || j.ownerId === filter.ownerId)
      .filter((j) => !statuses || statuses.includes(j.status))
      .filter((j) => !filter.kind || j.kind === filter.kind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter.limit === undefined ? jobs : jobs.slice(0, filter.limit);
  }

  deleteJob(id: string): Promise<void> {
    return this.mutex.run(async () => {
      const jobs = await this.readList("jobs.json", GenerationJobSchema);
      await this.writeList("jobs.json", jobs.filter((j) => j.id !== id));
    });
  }

  async countWeeklyGenerations(ownerId: string, since?: Date): Promise<number> {
    const from = (since ?? new Date(Date.now() - WEEK_MS)).toISOString();
    const jobs = await this.readList("jobs.json", GenerationJobSchema);
    return jobs.filter((j) => j.ownerId === ownerId && j.status !== "failed" && j.createdAt >= from).length;
  }
}
