/**
 * Client-safe media helpers (no Node imports).
 *
 * A MEDIA PATH is a relative, forward-slash path such as
 * "books/bk_ab12/page-3.png". Each segment may contain only
 * letters, digits, dot, dash and underscore.
 */

const SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export class InvalidMediaPathError extends Error {
  constructor(path: string) {
    super(`invalid media path: ${JSON.stringify(path)}`);
    this.name = "InvalidMediaPathError";
  }
}

/** Validates and returns the canonical media path, or throws InvalidMediaPathError. */
export function normalizeMediaPath(path: string): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 300) {
    throw new InvalidMediaPathError(String(path));
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (!SEGMENT_RE.test(segment) || segment.includes("..")) throw new InvalidMediaPathError(path);
  }
  return segments.join("/");
}

export function isValidMediaPath(path: string): boolean {
  try {
    normalizeMediaPath(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Browser URL for a media path: "/media/<path>". Values that already are URLs
 * (http, https, data, blob, or starting with "/") are returned unchanged, and
 * an empty value returns "" so callers can render a fallback.
 * Pass `version` (e.g. book.updatedAt) to bust caches after a file is replaced.
 *
 * Media of a book that is not published is served only to its owner, to
 * editors and admins (by their session cookie), or to a request that carries
 * the book's share token. Pass `shareToken` on pages that were opened through
 * a share link, so their pictures and audio load for a visitor without an
 * account. Never pass it for a published book: the URL would spread the token.
 */
export function mediaUrl(path: string | undefined | null, version?: string | number, shareToken?: string | null): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:|\/)/.test(path)) return path;
  const url = `/media/${path.split("/").map(encodeURIComponent).join("/")}`;
  const query: string[] = [];
  if (version !== undefined) query.push(`v=${encodeURIComponent(String(version))}`);
  if (shareToken) query.push(`t=${encodeURIComponent(shareToken)}`);
  return query.length === 0 ? url : `${url}?${query.join("&")}`;
}

/** Folder that holds all media of one book: "books/<bookId>". */
export function bookMediaPrefix(bookId: string): string {
  return `books/${bookId}`;
}

/** Media path of a file that belongs to a book: "books/<bookId>/<fileName>". */
export function bookMediaPath(bookId: string, fileName: string): string {
  return normalizeMediaPath(`${bookMediaPrefix(bookId)}/${fileName}`);
}

/** Makes an arbitrary upload name safe as a media path segment (keeps the extension). */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .slice(-80);
  return cleaned.length > 0 && SEGMENT_RE.test(cleaned) ? cleaned : "file";
}

const CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  // WebM stays "audio/webm": family recordings are WebM, and the Supabase
  // bucket is chosen from this type. Browsers play a WebM clip in <video> either way.
  webm: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  zip: "application/zip",
};

/** Content type derived from the file extension; "application/octet-stream" when unknown. */
export function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

const EXTENSIONS: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

/** File extension (without dot) for a content type; "bin" when unknown. Parameters like ";codecs=opus" are ignored. */
export function extensionForContentType(contentType: string): string {
  return EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()] ?? "bin";
}
