export interface MediaObject {
  bytes: Uint8Array;
  contentType: string;
  size: number;
  /** Last modification time in ms since epoch, when known. */
  mtimeMs?: number;
}

/**
 * Binary storage for illustrations and audio. Paths are MEDIA PATHS (see
 * ./url.ts); every method throws InvalidMediaPathError for an unsafe path.
 */
export interface MediaStore {
  readonly kind: "local" | "supabase";
  /**
   * Stores (or replaces) a file and returns its canonical path and URL.
   * The local store derives the served content type from the file extension,
   * so make the extension match `contentType` (see extensionForContentType()).
   */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<{ path: string; url: string }>;
  /** Returns null when the file does not exist. */
  get(path: string): Promise<MediaObject | null>;
  /** Idempotent. */
  delete(path: string): Promise<void>;
  /** Deletes every file under a folder prefix such as "books/<bookId>". Idempotent. */
  deletePrefix(prefix: string): Promise<void>;
  /** Lists media paths (recursively) under a folder prefix, sorted. */
  list(prefix: string): Promise<string[]>;
  /**
   * Browser URL of a media path: always the site's own "/media/<path>" route,
   * which decides who may download the file (see ./access.ts).
   */
  url(path: string): string;
  /**
   * Remote stores only: a time-limited direct download URL for a file the
   * /media route has already authorised. Null when the file does not exist.
   */
  signedUrl?(path: string, expiresInSeconds: number): Promise<string | null>;
}
