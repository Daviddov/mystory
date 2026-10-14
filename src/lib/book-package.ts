/**
 * Portable book packages (import and export).
 *
 * A portable book is a zip file:
 *
 *   book.json            BookPackageManifest (below)
 *   images/<file>        cover and page illustrations
 *   audio/<file>         page narration (and optional soundtrack)
 *
 * Inside book.json every media field holds a path RELATIVE TO THE ZIP ROOT
 * (e.g. "images/page-01.svg"), not a media-store path. Import rewrites them to
 * "books/<newBookId>/<file>" media paths; export does the reverse.
 *
 * Import treats the zip as hostile input:
 *   - entry names are checked for path traversal (zip-slip) and the package is
 *     refused when any entry tries to leave the archive root;
 *   - files are never written under a name taken from the zip: the stored name
 *     goes through safeFileName() and bookMediaPath();
 *   - size limits apply to the zip, to every file and to the decompressed total;
 *   - only allow-listed image and audio types are stored, and the bytes must
 *     match the extension.
 */
import JSZip from "jszip";
import { z } from "zod";
import { newId } from "./ids";
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, IMPORT_LIMITS, fileExtension } from "./importers/limits";
import { checkMediaFile, type MediaKind } from "./importers/media-sniff";
import { getMediaStore } from "./media";
import type { MediaStore } from "./media/types";
import { bookMediaPath, bookMediaPrefix, isValidMediaPath, safeFileName } from "./media/url";
import { BOOK_LIMITS } from "./limits";
import { getRepo } from "./repo";
import type { Repository } from "./repo/types";
import { BookWithPagesSchema, type BookWithPages, type Page } from "./types";

export const BOOK_PACKAGE_FORMAT = "mystory-book";
export const BOOK_PACKAGE_VERSION = 1;
export const BOOK_PACKAGE_MANIFEST = "book.json";
export const BOOK_PACKAGE_IMAGES_DIR = "images";
export const BOOK_PACKAGE_AUDIO_DIR = "audio";

/** Fields that belong to one installation and are not carried inside a package. */
export const PortableBookSchema = BookWithPagesSchema.omit({
  id: true,
  ownerId: true,
  status: true,
  shareToken: true,
  viewCount: true,
  reviewNote: true,
  costUsd: true,
  // The hero image is a studio working file; it does not travel with the book.
  hero: true,
}).partial({ slug: true, createdAt: true, updatedAt: true, publishedAt: true });
export type PortableBook = z.infer<typeof PortableBookSchema>;

export const BookPackageManifestSchema = z.object({
  format: z.literal(BOOK_PACKAGE_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.string(),
  book: PortableBookSchema,
  /**
   * Media the exporter could not bundle (file missing from storage, external
   * URL, unsupported type). The matching fields are empty in `book`.
   */
  missingMedia: z.array(z.string()).optional(),
});
export type BookPackageManifest = z.infer<typeof BookPackageManifestSchema>;

/** Optional storage overrides; tests pass an isolated repository and media store. */
export interface BookPackageDeps {
  repo?: Repository;
  media?: MediaStore;
}

export interface ImportBookOptions extends BookPackageDeps {
  ownerId: string;
  /** Default 'private'. */
  status?: BookWithPages["status"];
  /** Default 'import'. */
  origin?: BookWithPages["origin"];
}

export type BookPackageErrorCode =
  | "too-large"
  | "not-a-zip"
  | "unsafe-path"
  | "too-many-entries"
  | "manifest-missing"
  | "manifest-invalid"
  | "unsupported-version"
  | "too-many-pages"
  | "page-too-long"
  | "media-reference"
  | "media-missing"
  | "media-too-large"
  | "media-type";

const USER_MESSAGES: Record<BookPackageErrorCode, string> = {
  "too-large": "קובץ הספר גדול מדי.",
  "not-a-zip": "הקובץ אינו קובץ zip תקין.",
  "unsafe-path": "קובץ הספר מכיל נתיב קובץ לא בטוח, ולכן לא יובא.",
  "too-many-entries": "קובץ הספר מכיל יותר מדי קבצים.",
  "manifest-missing": "בקובץ ה-zip חסר הקובץ book.json. זה לא נראה כמו ספר שיוצא מהאתר.",
  "manifest-invalid": "הקובץ book.json אינו תקין.",
  "unsupported-version": "הספר יוצא בגרסה חדשה יותר של האתר, ואי אפשר לייבא אותו כאן.",
  "too-many-pages": "בספר יש יותר מדי עמודים.",
  "page-too-long": "באחד העמודים בספר יש טקסט ארוך מדי.",
  "media-reference": "הספר מפנה לקובץ מדיה מחוץ לתיקיות images ו-audio.",
  "media-missing": "הספר מפנה לקובץ תמונה או שמע שלא נמצא בתוך ה-zip.",
  "media-too-large": "אחד מקובצי התמונה או השמע בספר גדול מדי.",
  "media-type": "אחד מקובצי המדיה בספר אינו תמונה או שמע מסוג נתמך.",
};

/** A package that was refused. `userMessage` is Hebrew and safe to show; `message` is for logs. */
export class BookPackageError extends Error {
  readonly code: BookPackageErrorCode;
  readonly userMessage: string;

  constructor(code: BookPackageErrorCode, detail?: string) {
    super(detail ? `book package rejected (${code}): ${detail}` : `book package rejected (${code})`);
    this.name = "BookPackageError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

/** @deprecated Import and export are implemented; nothing throws this any more. Kept for old imports. */
export class BookPackageNotImplementedError extends Error {
  constructor(operation: string) {
    super(`book package ${operation} is not implemented yet (src/lib/book-package.ts)`);
    this.name = "BookPackageNotImplementedError";
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Builds the zip for a book, reading its media from the media store. */
export async function exportBookPackage(book: BookWithPages, deps: BookPackageDeps = {}): Promise<Uint8Array> {
  const media = deps.media ?? (await getMediaStore());
  const zip = new JSZip();
  const bundled = new Map<string, string>();
  const missing: string[] = [];

  /** Adds one media file to the zip and returns its zip path, or undefined when it cannot be bundled. */
  const bundle = async (
    mediaPath: string | undefined,
    kind: MediaKind,
    baseName: string,
  ): Promise<string | undefined> => {
    if (!mediaPath) return undefined;
    const known = bundled.get(mediaPath);
    if (known) return known;

    const ext = fileExtension(mediaPath);
    const allowed = kind === "image" ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS;
    const object = isValidMediaPath(mediaPath) && ext in allowed ? await media.get(mediaPath) : null;
    if (!object) {
      missing.push(mediaPath);
      return undefined;
    }
    const dir = kind === "image" ? BOOK_PACKAGE_IMAGES_DIR : BOOK_PACKAGE_AUDIO_DIR;
    const zipPath = `${dir}/${baseName}.${ext}`;
    zip.file(zipPath, object.bytes);
    bundled.set(mediaPath, zipPath);
    return zipPath;
  };

  const pages: Page[] = [];
  const sorted = [...book.pages].sort((a, b) => a.index - b.index);
  for (const [i, page] of sorted.entries()) {
    const image = await bundle(page.image, "image", `page-${pad(i + 1)}`);
    const audio = await bundle(page.audio, "audio", `page-${pad(i + 1)}`);
    const next: Page = { ...page, index: i };
    if (image) next.image = image;
    else delete next.image;
    if (audio) next.audio = audio;
    else {
      // Word timings and the audio source describe a recording that is not in the package.
      delete next.audio;
      delete next.wordTimings;
      delete next.audioSource;
    }
    pages.push(next);
  }

  const coverImage = (await bundle(book.coverImage || undefined, "image", "cover")) ?? "";
  const soundtrack = await bundle(book.soundtrack, "audio", "soundtrack");
  // The publisher logo is part of the required credit, so it travels with the book.
  let credits = book.credits;
  if (credits?.publisherLogo) {
    const { publisherLogo, ...rest } = credits;
    const logo = await bundle(publisherLogo, "image", "publisher-logo");
    credits = logo ? { ...rest, publisherLogo: logo } : rest;
  }

  // The schema strips the installation-specific fields (id, ownerId, status, ...).
  const portable = PortableBookSchema.parse({ ...book, coverImage, soundtrack, credits, pages });
  const manifest: BookPackageManifest = {
    format: BOOK_PACKAGE_FORMAT,
    version: BOOK_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    book: portable,
    ...(missing.length > 0 ? { missingMedia: missing } : {}),
  };
  zip.file(BOOK_PACKAGE_MANIFEST, JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * True when a zip entry name could escape the extraction root or is not a
 * plain relative path: absolute paths, drive letters, backslashes, NUL bytes
 * and "." / ".." segments.
 */
export function isUnsafeZipEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 1024) return true;
  if (name.includes("\0") || name.includes("\\")) return true;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return true;
  const segments = name.replace(/\/$/, "").split("/");
  return segments.some((segment) => segment === "" || segment === "." || segment === "..");
}

interface SizedZipObject extends JSZip.JSZipObject {
  // JSZip keeps the central-directory sizes here. They come from the archive
  // and may lie, so they only serve as a cheap early refusal; the real limit is
  // enforced while decompressing (readEntry).
  _data?: { uncompressedSize?: number };
}

interface StreamableZipObject extends JSZip.JSZipObject {
  // Documented JSZip API (ZipObject#internalStream) that is missing from its type declarations.
  internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
}

function declaredSize(entry: JSZip.JSZipObject): number | undefined {
  const size = (entry as SizedZipObject)._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : undefined;
}

/**
 * Decompresses one entry, never keeping more than `limit` bytes.
 *
 * The entry is inflated as a stream and abandoned as soon as the output passes
 * the limit. entry.async() must not be used here: it inflates the whole entry
 * into memory before comparing its length with the declared size, so an archive
 * with a forged size field (a decompression bomb) would exhaust the server.
 */
function readEntry(entry: JSZip.JSZipObject, limit: number, tooLarge: BookPackageErrorCode): Promise<Uint8Array> {
  const declared = declaredSize(entry);
  if (declared !== undefined && declared > limit) {
    return Promise.reject(new BookPackageError(tooLarge, entry.name));
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    let chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    const stream = (entry as StreamableZipObject).internalStream("uint8array");
    stream
      .on("data", (chunk) => {
        if (settled) return;
        total += chunk.byteLength;
        if (total > limit) {
          settled = true;
          chunks = [];
          // Stops the inflater from being fed any more compressed input.
          stream.pause();
          reject(new BookPackageError(tooLarge, entry.name));
          return;
        }
        chunks.push(chunk);
      })
      .on("error", (err) => {
        if (settled) return;
        settled = true;
        chunks = [];
        reject(new BookPackageError("not-a-zip", `cannot read ${entry.name}: ${String(err)}`));
      })
      .on("end", () => {
        if (settled) return;
        settled = true;
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        chunks = [];
        resolve(bytes);
      })
      .resume();
  });
}

const MEDIA_DIRS: Record<MediaKind, string> = {
  image: BOOK_PACKAGE_IMAGES_DIR,
  audio: BOOK_PACKAGE_AUDIO_DIR,
};

/** File name of a manifest media reference such as "images/page-01.png"; throws when it is anything else. */
function referencedFileName(reference: string, kind: MediaKind): string {
  if (isUnsafeZipEntryName(reference)) throw new BookPackageError("unsafe-path", reference);
  const parts = reference.split("/");
  if (parts.length !== 2 || parts[0] !== MEDIA_DIRS[kind] || parts[1] === "") throw new BookPackageError("media-reference", reference);
  return parts[1];
}

/** Validates a zip, stores its media, creates the book through the repository and returns it. */
export async function importBookPackage(zipBytes: Uint8Array, options: ImportBookOptions): Promise<BookWithPages> {
  if (zipBytes.byteLength > IMPORT_LIMITS.packageBytes) throw new BookPackageError("too-large");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch (err) {
    throw new BookPackageError("not-a-zip", String(err));
  }

  // 1. Entry names, entry count and declared total size, before anything is decompressed.
  //    The declared total is a cheap early refusal only; step 3 counts the real bytes.
  const entries = Object.values(zip.files);
  if (entries.length > IMPORT_LIMITS.packageEntries) throw new BookPackageError("too-many-entries");
  let declaredTotal = 0;
  for (const entry of entries) {
    // JSZip resolves "../" in `name` and keeps the name found in the archive in unsafeOriginalName.
    const original = entry.unsafeOriginalName ?? entry.name;
    if (isUnsafeZipEntryName(original) || isUnsafeZipEntryName(entry.name)) {
      throw new BookPackageError("unsafe-path", original);
    }
    declaredTotal += declaredSize(entry) ?? 0;
  }
  if (declaredTotal > IMPORT_LIMITS.packageUncompressedBytes) throw new BookPackageError("too-large", "uncompressed");

  // 2. Manifest.
  const manifestEntry = zip.file(BOOK_PACKAGE_MANIFEST);
  if (!manifestEntry) throw new BookPackageError("manifest-missing");
  const manifestBytes = await readEntry(manifestEntry, IMPORT_LIMITS.manifestBytes, "manifest-invalid");
  let manifest: BookPackageManifest;
  try {
    const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
    const version = (json as { version?: unknown } | null)?.version;
    if (typeof version === "number" && version > BOOK_PACKAGE_VERSION) {
      throw new BookPackageError("unsupported-version", String(version));
    }
    manifest = BookPackageManifestSchema.parse(json);
  } catch (err) {
    if (err instanceof BookPackageError) throw err;
    throw new BookPackageError("manifest-invalid", err instanceof Error ? err.message : String(err));
  }
  const portable = manifest.book;
  if (portable.pages.length > IMPORT_LIMITS.pages) throw new BookPackageError("too-many-pages");
  // The same per-page limits the studio saves with (src/lib/limits.ts): a book
  // that could be imported but never saved again would be stuck.
  for (const [i, page] of portable.pages.entries()) {
    if (page.text.length > BOOK_LIMITS.pageTextChars || (page.textNikud?.length ?? 0) > BOOK_LIMITS.pageNikudChars) {
      throw new BookPackageError("page-too-long", `page ${i + 1}`);
    }
  }

  // 3. Read and check every referenced media file. Nothing is stored yet.
  const bookId = newId("bk");
  const resolved = new Map<string, { mediaPath: string; bytes: Uint8Array; contentType: string }>();
  const usedNames = new Set<string>();
  let readTotal = manifestBytes.byteLength;

  const resolve = async (reference: string | undefined, kind: MediaKind): Promise<string | undefined> => {
    if (!reference) return undefined;
    const key = `${kind}:${reference}`;
    const known = resolved.get(key);
    if (known) return known.mediaPath;

    const fileName = referencedFileName(reference, kind);
    const entry = zip.file(reference);
    if (!entry || entry.dir) throw new BookPackageError("media-missing", reference);
    const limit = kind === "image" ? IMPORT_LIMITS.imageBytes : IMPORT_LIMITS.audioBytes;
    const bytes = await readEntry(entry, limit, "media-too-large");
    readTotal += bytes.byteLength;
    if (readTotal > IMPORT_LIMITS.packageUncompressedBytes) throw new BookPackageError("too-large", "uncompressed");

    const check = checkMediaFile(kind, fileName, bytes);
    if (!check.ok || !check.contentType) throw new BookPackageError("media-type", `${reference} (${check.reason})`);

    // The stored name never comes straight from the zip. Names are compared
    // case-insensitively because the local store may sit on such a filesystem.
    const safe = safeFileName(fileName);
    const ext = fileExtension(fileName);
    const baseName = fileExtension(safe) === ext ? safe : `file.${ext}`;
    let storedName = baseName;
    for (let n = 2; usedNames.has(storedName.toLowerCase()); n += 1) {
      storedName = `${n}-${baseName.slice(-70)}`;
    }
    usedNames.add(storedName.toLowerCase());

    const mediaPath = bookMediaPath(bookId, storedName);
    resolved.set(key, { mediaPath, bytes, contentType: check.contentType });
    return mediaPath;
  };

  const pages: Page[] = [];
  const sortedPages = [...portable.pages].sort((a, b) => a.index - b.index);
  for (const [i, page] of sortedPages.entries()) {
    const next: Page = { ...page, index: i };
    const image = await resolve(page.image, "image");
    const audio = await resolve(page.audio, "audio");
    if (image) next.image = image;
    else delete next.image;
    if (audio) next.audio = audio;
    else delete next.audio;
    pages.push(next);
  }
  const coverImage = (await resolve(portable.coverImage || undefined, "image")) ?? "";
  const soundtrack = await resolve(portable.soundtrack, "audio");
  let credits = portable.credits;
  if (credits?.publisherLogo) {
    const { publisherLogo, ...rest } = credits;
    credits = { ...rest, publisherLogo: await resolve(publisherLogo, "image") };
  }

  // 4. Store the media, then create the book. Roll the media back when anything fails.
  const media = options.media ?? (await getMediaStore());
  const repo = options.repo ?? (await getRepo());
  try {
    for (const file of resolved.values()) await media.put(file.mediaPath, file.bytes, file.contentType);
    return await repo.createBook({
      id: bookId,
      ownerId: options.ownerId,
      status: options.status ?? "private",
      origin: options.origin ?? "import",
      title: portable.title,
      summary: portable.summary,
      author: portable.author,
      illustrator: portable.illustrator,
      license: portable.license,
      source: portable.source,
      ageGroup: portable.ageGroup,
      readingMinutes: portable.readingMinutes,
      categories: portable.categories,
      tags: portable.tags,
      themes: portable.themes,
      discussionQuestions: portable.discussionQuestions,
      coverImage,
      soundtrack,
      language: portable.language,
      originalLanguage: portable.originalLanguage,
      credits,
      pages,
    });
  } catch (err) {
    await media.deletePrefix(bookMediaPrefix(bookId)).catch(() => undefined);
    throw err;
  }
}
