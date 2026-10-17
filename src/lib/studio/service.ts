/**
 * Studio business logic. Every function takes the acting user and enforces
 * ownership itself, so a route handler only has to authenticate and parse.
 * Server only.
 */
import "server-only";
import { canEditBook, hasRole } from "../auth";
import { withBookLock } from "../book-lock";
import { estimateReadingMinutes, slugify } from "../hebrew";
import { newId, newShareToken } from "../ids";
import { BOOK_LIMITS } from "../limits";
import { storeImage } from "../media/optimize";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, contentTypeForPath, isValidMediaPath } from "../media/url";
import { assertOwnerCanAddBook, BookCapError } from "../owner-books";
import { NotFoundError, type BookPatch, type Repository } from "../repo/types";
import { IdSchema, type Book, type BookStatus, type BookWithPages, type Page, type User } from "../types";
import {
  AUDIO_MAX_BYTES,
  IMAGE_MAX_BYTES,
  MAX_MEDIA_FILES_PER_BOOK,
  publishProblems,
  sanitizePages,
  type BookMetaPatch,
  type CreateBookInput,
  type PagesPayload,
  type UploadKind,
} from "./shared";
import { sniffMedia } from "./upload";

/** A refused studio operation with a Hebrew message that is safe to show the user. */
export class StudioError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409 | 413 | 415,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "StudioError";
  }
}

export interface StudioContext {
  repo: Repository;
  media: MediaStore;
  user: User;
}

/** Most books one account may own (shared with the importers, see src/lib/limits.ts). */
export const MAX_BOOKS_PER_OWNER = BOOK_LIMITS.booksPerOwner;

const PUBLISHED_LOCK_MESSAGE =
  "ספר שפורסם בספרייה נעול לעריכה. כדי לערוך אותו צריך קודם להחזיר אותו למצב פרטי.";
const PENDING_LOCK_MESSAGE =
  "הספר הוגש לפרסום וממתין לאישור, ולכן הוא נעול לעריכה. כדי לערוך אותו צריך קודם לבטל את ההגשה ולהחזיר אותו למצב פרטי.";
export const STALE_VERSION_MESSAGE =
  "הספר השתנה במקום אחר (בלשונית אחרת, במכשיר אחר או על ידי עורך), ולכן השינוי לא נשמר. טענו את העמוד מחדש כדי להמשיך לערוך.";
/** `details.code` of the 409 that answers a save based on an older version of the book. */
export const STALE_VERSION_CODE = "stale-version";

/** What a save was based on. When given, the save is refused unless the book is still at that version. */
export interface SaveOptions {
  /** The `updatedAt` of the book the client last saw. */
  baseUpdatedAt?: string;
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * Loads a book the user may edit (owner, editor or admin). A book that exists
 * but belongs to someone else is reported as missing, so ids cannot be probed.
 */
export async function loadEditableBook(ctx: StudioContext, id: string): Promise<BookWithPages> {
  if (!IdSchema.safeParse(id).success) throw new NotFoundError("book");
  const book = await ctx.repo.getBookById(id);
  if (!book || !canEditBook(book, ctx.user)) throw new NotFoundError("book");
  return book;
}

/**
 * Owners cannot change a published book (that would put unreviewed content in
 * the public library) nor a book that waits for review (the editor must
 * approve exactly what they read). They move it back to private first.
 * Editors and admins may always edit.
 */
export function assertBookWritable(book: Pick<Book, "status">, user: User): void {
  if (hasRole(user, "editor")) return;
  if (book.status === "published") throw new StudioError(409, PUBLISHED_LOCK_MESSAGE);
  if (book.status === "pending") throw new StudioError(409, PENDING_LOCK_MESSAGE);
}
const assertContentEditable = assertBookWritable;

/** Refuses a save that was based on an older version of the book than the stored one. */
function assertFreshVersion(book: Pick<Book, "updatedAt">, options: SaveOptions): void {
  if (options.baseUpdatedAt !== undefined && options.baseUpdatedAt !== book.updatedAt) {
    throw new StudioError(409, STALE_VERSION_MESSAGE, { code: STALE_VERSION_CODE, updatedAt: book.updatedAt });
  }
}

// ---------------------------------------------------------------------------
// Media references
// ---------------------------------------------------------------------------

function ownMediaPrefix(bookId: string): string {
  return `${bookMediaPrefix(bookId)}/`;
}

/** Media paths a book points at that live inside its own folder. */
export function ownMediaReferences(book: BookWithPages): Set<string> {
  const prefix = ownMediaPrefix(book.id);
  const refs = new Set<string>();
  const add = (path: string | undefined) => {
    if (path && path.startsWith(prefix)) refs.add(path);
  };
  add(book.coverImage);
  add(book.soundtrack);
  add(book.hero?.image);
  for (const page of book.pages) {
    add(page.image);
    add(page.audio);
  }
  return refs;
}

function allMediaReferences(book: BookWithPages): Set<string> {
  const refs = new Set<string>();
  if (book.coverImage) refs.add(book.coverImage);
  if (book.hero?.image) refs.add(book.hero.image);
  for (const page of book.pages) {
    if (page.image) refs.add(page.image);
    if (page.audio) refs.add(page.audio);
    if (page.video) refs.add(page.video);
  }
  return refs;
}

/**
 * Deletes files that the book referenced before a save and no longer
 * references after it. Files that were never referenced (an upload whose page
 * is not saved yet, audio another process is still writing) are left alone.
 *
 * Only call this after a CONDITIONAL save (SaveOptions.baseUpdatedAt matched):
 * a snapshot from a stale tab lacks the files another writer added, and
 * deleting by it would destroy their work.
 */
async function deleteDroppedMedia(media: MediaStore, before: BookWithPages, after: BookWithPages): Promise<void> {
  const kept = ownMediaReferences(after);
  for (const path of ownMediaReferences(before)) {
    if (kept.has(path)) continue;
    try {
      await media.delete(path);
    } catch (err) {
      console.warn("[studio] could not delete unused media", path, err);
    }
  }
}

function assertMediaField(
  book: BookWithPages,
  known: Set<string>,
  path: string,
  expected: "image" | "audio",
  label: string,
): void {
  // A path the stored book already uses is always accepted, so old or imported books stay saveable.
  if (known.has(path)) return;
  const valid =
    isValidMediaPath(path) &&
    path.startsWith(ownMediaPrefix(book.id)) &&
    contentTypeForPath(path).startsWith(`${expected}/`);
  if (!valid) throw new StudioError(400, `${label}: הקובץ אינו שייך לספר הזה`);
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export async function listMyBooks(ctx: StudioContext): Promise<Book[]> {
  const { books } = await ctx.repo.listBooks({ ownerId: ctx.user.id, status: "any", sort: "updated" });
  return books;
}

export async function createStudioBook(ctx: StudioContext, input: CreateBookInput): Promise<BookWithPages> {
  try {
    await assertOwnerCanAddBook(ctx.repo, ctx.user.id);
  } catch (err) {
    if (err instanceof BookCapError) throw new StudioError(409, err.message);
    throw err;
  }
  return ctx.repo.createBook({
    title: input.title,
    ownerId: ctx.user.id,
    ageGroup: input.ageGroup,
    author: input.author ?? ctx.user.name,
    status: "draft",
    origin: "manual",
    pages: [{ index: 0, text: "" }],
  });
}

export async function updateBookMeta(
  ctx: StudioContext,
  id: string,
  patch: BookMetaPatch,
  options: SaveOptions = {},
): Promise<BookWithPages> {
  if (!IdSchema.safeParse(id).success) throw new NotFoundError("book");
  return withBookLock(id, () => updateBookMetaLocked(ctx, id, patch, options));
}

async function updateBookMetaLocked(
  ctx: StudioContext,
  id: string,
  patch: BookMetaPatch,
  options: SaveOptions,
): Promise<BookWithPages> {
  const book = await loadEditableBook(ctx, id);
  assertContentEditable(book, ctx.user);
  assertFreshVersion(book, options);

  const clean: BookPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (clean as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(clean).length === 0) return book;

  if (patch.credits !== undefined) {
    // Empty fields are dropped; the stored publisher logo (a media file) is kept as is.
    const credits: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch.credits)) {
      if (key !== "publisherLogo" && typeof value === "string" && value.length > 0) credits[key] = value;
    }
    if (book.credits?.publisherLogo) credits.publisherLogo = book.credits.publisherLogo;
    clean.credits = Object.keys(credits).length > 0 ? credits : undefined;
  }

  if (patch.hero !== undefined) {
    const hero = patch.hero;
    // A hero with neither a description nor a picture is no hero.
    clean.hero = hero && (hero.description || hero.image) ? { ...hero, style: hero.style || undefined } : undefined;
  }

  if (clean.coverImage) assertMediaField(book, allMediaReferences(book), clean.coverImage, "image", "תמונת השער");
  if (clean.hero?.image) assertMediaField(book, allMediaReferences(book), clean.hero.image, "image", "תמונת הגיבור");

  const updated = await ctx.repo.updateBook(id, clean);
  const after: BookWithPages = { ...updated, pages: book.pages };
  if (options.baseUpdatedAt !== undefined) await deleteDroppedMedia(ctx.media, book, after);
  return after;
}

/**
 * Replaces all pages. With `options.baseUpdatedAt` the save is conditional: it
 * is refused with 409 when the book changed since the client loaded it, so a
 * stale tab cannot overwrite newer work. Dropped media files are deleted only
 * after such a conditional save; an unconditional save never deletes files.
 */
export async function saveBookPages(
  ctx: StudioContext,
  id: string,
  payload: PagesPayload,
  options: SaveOptions = {},
): Promise<BookWithPages> {
  if (!IdSchema.safeParse(id).success) throw new NotFoundError("book");
  return withBookLock(id, () => saveBookPagesLocked(ctx, id, payload, options));
}

async function saveBookPagesLocked(
  ctx: StudioContext,
  id: string,
  payload: PagesPayload,
  options: SaveOptions,
): Promise<BookWithPages> {
  const book = await loadEditableBook(ctx, id);
  assertContentEditable(book, ctx.user);
  assertFreshVersion(book, options);

  const pages: Page[] = keepAnimations(book.pages, sanitizePages(payload.pages));
  const known = allMediaReferences(book);
  pages.forEach((page, i) => {
    if (page.image) assertMediaField(book, known, page.image, "image", `האיור בעמוד ${i + 1}`);
    if (page.audio) assertMediaField(book, known, page.audio, "audio", `ההקראה בעמוד ${i + 1}`);
  });

  let after = await ctx.repo.replacePages(id, pages);
  const readingMinutes = estimateReadingMinutes(pages.map((page) => page.text));
  if (after.readingMinutes !== readingMinutes) {
    const updated = await ctx.repo.updateBook(id, { readingMinutes });
    after = { ...updated, pages: after.pages };
  }
  if (options.baseUpdatedAt !== undefined) await deleteDroppedMedia(ctx.media, book, after);
  return after;
}

/**
 * The editor does not send animation clips (they are made by the animation
 * pipeline), so a page keeps the clip that was made from its illustration.
 * A page whose illustration was replaced loses its clip.
 */
function keepAnimations(before: Page[], pages: Page[]): Page[] {
  const byImage = new Map<string, Page>();
  for (const page of before) if (page.image && page.video) byImage.set(page.image, page);
  return pages.map((page) => {
    const old = page.image ? byImage.get(page.image) : undefined;
    if (!old) return page;
    return { ...page, video: old.video, videoImageHash: old.videoImageHash, videoSource: old.videoSource };
  });
}

export async function deleteStudioBook(ctx: StudioContext, id: string): Promise<void> {
  const book = await loadEditableBook(ctx, id);
  assertContentEditable(book, ctx.user);
  await ctx.repo.deleteBook(book.id);
  try {
    await ctx.media.deletePrefix(bookMediaPrefix(book.id));
  } catch (err) {
    console.warn("[studio] could not delete media of book", book.id, err);
  }
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export interface StoredUpload {
  /** Media path to put in page.image, page.audio or book.coverImage. */
  path: string;
  url: string;
  kind: UploadKind;
  contentType: string;
  size: number;
}

const UPLOAD_PREFIX: Record<UploadKind, string> = { image: "img", cover: "cover", audio: "rec" };

export function maxUploadBytes(kind: UploadKind): number {
  return kind === "audio" ? AUDIO_MAX_BYTES : IMAGE_MAX_BYTES;
}

/**
 * Validates and stores one uploaded file in the book's folder. The book is not
 * changed: the caller puts the returned path in a page and saves the pages.
 */
export async function storeUpload(
  ctx: StudioContext,
  id: string,
  kind: UploadKind,
  bytes: Uint8Array,
): Promise<StoredUpload> {
  const book = await loadEditableBook(ctx, id);
  assertContentEditable(book, ctx.user);

  if (bytes.byteLength === 0) throw new StudioError(400, "הקובץ ריק");
  const limit = maxUploadBytes(kind);
  if (bytes.byteLength > limit) {
    throw new StudioError(413, `הקובץ גדול מדי. הגודל המרבי הוא ${Math.round(limit / (1024 * 1024))} מ"ב.`);
  }

  const sniffed = sniffMedia(bytes);
  const wanted = kind === "audio" ? "audio" : "image";
  if (!sniffed || sniffed.kind !== wanted) {
    throw new StudioError(
      415,
      wanted === "image"
        ? "סוג הקובץ לא נתמך. אפשר להעלות תמונות PNG, JPG, WebP, GIF או AVIF."
        : "סוג הקובץ לא נתמך. אפשר להעלות הקלטות MP3, WAV, OGG, M4A או WebM.",
    );
  }

  const existing = await ctx.media.list(bookMediaPrefix(book.id));
  if (existing.length >= MAX_MEDIA_FILES_PER_BOOK) {
    throw new StudioError(409, "יש יותר מדי קבצים בספר הזה. מחקו עמודים שאינם בשימוש ונסו שוב.");
  }

  const path = bookMediaPath(book.id, `${UPLOAD_PREFIX[kind]}-${newId()}.${sniffed.ext}`);
  // Pictures are stored as WebP (see ../media/optimize.ts); the returned path is the one to save.
  const stored =
    kind === "audio"
      ? { ...(await ctx.media.put(path, bytes, sniffed.contentType)), contentType: sniffed.contentType, size: bytes.byteLength }
      : await storeImage(ctx.media, path, bytes, sniffed.contentType);
  return { path: stored.path, url: stored.url, kind, contentType: stored.contentType, size: stored.size };
}

// ---------------------------------------------------------------------------
// Status and sharing
// ---------------------------------------------------------------------------

/**
 * A nicer slug from the current title, for a book that was never published
 * (so no public link can break). Returns undefined when the slug should stay.
 */
async function slugFromTitle(repo: Repository, book: BookWithPages): Promise<string | undefined> {
  if (book.publishedAt) return undefined;
  const base = slugify(book.title);
  if (!base) return undefined;
  if (book.slug === base || new RegExp(`^${base}-\\d+$`).test(book.slug)) return undefined;
  for (let n = 1; n <= 30; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (candidate.length > 80) return undefined;
    if (!(await repo.getBookBySlug(candidate))) return candidate;
  }
  return undefined;
}

export async function setBookStatus(ctx: StudioContext, id: string, status: BookStatus): Promise<BookWithPages> {
  if (!IdSchema.safeParse(id).success) throw new NotFoundError("book");
  return withBookLock(id, () => setBookStatusLocked(ctx, id, status));
}

async function setBookStatusLocked(ctx: StudioContext, id: string, status: BookStatus): Promise<BookWithPages> {
  const book = await loadEditableBook(ctx, id);
  if (status === "published" && !hasRole(ctx.user, "editor")) {
    throw new StudioError(403, "רק עורכים יכולים לפרסם ספר בספרייה. אפשר להגיש את הספר לאישור.");
  }

  const patch: BookPatch = { status };
  // While the book was public its share token may have been seen by anyone who
  // could read it; a book that leaves the library must not stay open through it.
  if (book.status === "published" && status !== "published" && book.shareToken) patch.shareToken = undefined;
  if (status === "pending" || status === "published") {
    const problems = publishProblems(book);
    if (problems.length > 0) throw new StudioError(400, "הספר עוד לא מוכן להגשה", problems);
    if (!book.coverImage) {
      const firstImage = book.pages.find((page) => page.image)?.image;
      if (firstImage) patch.coverImage = firstImage;
    }
  }
  // A new submission starts a new review round.
  if (status === "pending" && book.reviewNote !== undefined) patch.reviewNote = undefined;

  let updated: Book | undefined;
  const slug = await slugFromTitle(ctx.repo, book);
  if (slug) {
    try {
      updated = await ctx.repo.updateBook(id, { ...patch, slug });
    } catch (err) {
      // The rename is cosmetic (taken meanwhile, or the folder is busy): keep the old slug.
      console.warn("[studio] could not rename slug of book", id, err);
    }
  }
  updated ??= await ctx.repo.updateBook(id, patch);
  return { ...updated, pages: book.pages };
}

export async function createShareLink(ctx: StudioContext, id: string): Promise<BookWithPages> {
  const book = await loadEditableBook(ctx, id);
  if (book.shareToken) return book;
  const updated = await ctx.repo.updateBook(id, { shareToken: newShareToken() });
  return { ...updated, pages: book.pages };
}

export async function removeShareLink(ctx: StudioContext, id: string): Promise<BookWithPages> {
  const book = await loadEditableBook(ctx, id);
  if (!book.shareToken) return book;
  const updated = await ctx.repo.updateBook(id, { shareToken: undefined });
  return { ...updated, pages: book.pages };
}
