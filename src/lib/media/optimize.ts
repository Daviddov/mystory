/**
 * Every illustration the site stores goes through here: PNG, JPEG, WebP and
 * AVIF become a WebP of at most WEBP_MAX_SIDE pixels on the long side
 * (quality WEBP_QUALITY, alpha kept), the same settings as
 * scripts/compress-media.ts. The media path follows: "page-01.png" is stored
 * as "page-01.webp", and that is the path to save in the book.
 *
 *   const file = await prepareImage(bookMediaPath(id, "page-01.png"), bytes, "image/png");
 *   // file.path is "books/<id>/page-01.webp" (or the original path, see below)
 *   await putImage(store, file);
 *
 * The image is stored as it came when it is GIF or SVG (or anything else that
 * is not a still raster image), when it cannot be decoded, or when the WebP
 * would not be at least 10% smaller.
 *
 * The full-resolution original is kept by stores that implement putOriginal()
 * (the local store: <dataDir>/originals/media/<original path>). The Supabase
 * store does not keep originals; see MediaStore.putOriginal.
 *
 * No "server-only" import: the CLI scripts use this too.
 */
import sharp from "sharp";
import type { MediaStore } from "./types";

export const WEBP_MAX_SIDE = 1600;
export const WEBP_QUALITY = 80;
/** The WebP must be at most this share of the input size, or the input is kept. */
export const WEBP_MAX_RATIO = 0.9;

const CONVERTIBLE = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

/** What storing needs from a MediaStore (callers often hold a narrowed one). */
export type ImageStore = Pick<MediaStore, "put" | "putOriginal">;

/** A file ready for MediaStore.put, plus the original it was made from (when converted). */
export interface PreparedImage {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  original?: { path: string; bytes: Uint8Array; contentType: string };
}

/** Re-encodes an image as WebP (the site's settings by default). Throws when sharp cannot decode it. */
export async function encodeWebp(
  input: Uint8Array,
  { maxSide = WEBP_MAX_SIDE, quality = WEBP_QUALITY }: { maxSide?: number; quality?: number } = {},
): Promise<Uint8Array> {
  const output = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toBuffer();
  return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
}

/** "books/x/page-01.png" -> "books/x/page-01.webp" (an extensionless path gets ".webp" added). */
export function webpPath(mediaPath: string): string {
  const slash = mediaPath.lastIndexOf("/");
  const dot = mediaPath.lastIndexOf(".");
  return `${dot > slash ? mediaPath.slice(0, dot) : mediaPath}.webp`;
}

export function isConvertibleImage(contentType: string): boolean {
  return CONVERTIBLE.has(contentType.split(";")[0].trim().toLowerCase());
}

/**
 * Converts an image for storage. `path` is the media path the caller would use
 * for the bytes as they are; the result carries the path to store and save.
 */
export async function prepareImage(path: string, bytes: Uint8Array, contentType: string): Promise<PreparedImage> {
  const asIs: PreparedImage = { path, bytes, contentType };
  if (!isConvertibleImage(contentType)) return asIs;
  let webp: Uint8Array;
  try {
    webp = await encodeWebp(bytes);
  } catch {
    return asIs;
  }
  if (webp.byteLength > bytes.byteLength * WEBP_MAX_RATIO) return asIs;
  return { path: webpPath(path), bytes: webp, contentType: "image/webp", original: { path, bytes, contentType } };
}

/**
 * Stores a prepared image, then its original where the store keeps originals.
 * A failure to keep the original is logged, not thrown: the served file is in place.
 */
export async function putImage(store: ImageStore, image: PreparedImage): Promise<{ path: string; url: string }> {
  const stored = await store.put(image.path, image.bytes, image.contentType);
  if (image.original && store.putOriginal) {
    try {
      await store.putOriginal(image.original.path, image.original.bytes);
    } catch (err) {
      console.warn(`could not keep the original of ${image.path}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return stored;
}

/** prepareImage + putImage: stores an illustration and returns the path to save in the book. */
export async function storeImage(
  store: ImageStore,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; url: string; contentType: string; size: number }> {
  const image = await prepareImage(path, bytes, contentType);
  const stored = await putImage(store, image);
  return { ...stored, contentType: image.contentType, size: image.bytes.byteLength };
}
