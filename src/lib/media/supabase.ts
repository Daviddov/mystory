/**
 * SupabaseMediaStore: media files in Supabase Storage (buckets and policies in
 * supabase/migrations). Loaded lazily by getMediaStore() only when the Supabase
 * env vars are set.
 *
 * A media path keeps its name inside the bucket ("books/<bookId>/page-01.png");
 * the bucket is chosen by file extension: illustrations, narration audio, and
 * everything else (including the mp4 clips of animated illustrations: the
 * book-files bucket has no MIME type allowlist).
 *
 * The buckets are PRIVATE (migration 20261013000400_private_media.sql).
 * Browsers always ask the site's own /media route, which checks who may see
 * the file (media of an unpublished book is not public) and then redirects to
 * a short-lived signed URL from signedUrl(). Uploads and signing use the
 * service-role key.
 *
 * NOT TESTED against a real Supabase project.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../config";
import { getSupabaseAdmin } from "../repo/supabase";
import type { MediaObject, MediaStore } from "./types";
import { contentTypeForPath, mediaUrl, normalizeMediaPath } from "./url";

export const IMAGE_BUCKET = "book-images";
export const AUDIO_BUCKET = "book-audio";
export const FILE_BUCKET = "book-files";
const BUCKETS = [IMAGE_BUCKET, AUDIO_BUCKET, FILE_BUCKET] as const;

const LIST_PAGE = 1000;
const REMOVE_CHUNK = 100;

/** The bucket depends only on the extension, so a path always maps to one bucket. */
export function bucketForPath(mediaPath: string): string {
  const type = contentTypeForPath(mediaPath);
  if (type.startsWith("image/")) return IMAGE_BUCKET;
  if (type.startsWith("audio/")) return AUDIO_BUCKET;
  return FILE_BUCKET;
}

function isMissing(error: { message?: string; status?: number; statusCode?: string | number }): boolean {
  const status = Number(error.status ?? error.statusCode);
  return status === 404 || status === 400 || /not.?found/i.test(error.message ?? "");
}

export class SupabaseMediaStore implements MediaStore {
  readonly kind = "supabase" as const;

  constructor(
    private readonly db: SupabaseClient,
    private readonly baseUrl: string,
  ) {}

  async put(mediaPath: string, bytes: Uint8Array, contentType: string) {
    const normalized = normalizeMediaPath(mediaPath);
    const bucket = bucketForPath(normalized);
    const { error } = await this.db.storage.from(bucket).upload(normalized, bytes, {
      // The bucket follows the extension, so the stored type must too
      // (the audio and image buckets only accept their own MIME types).
      contentType: bucket === FILE_BUCKET ? contentType : contentTypeForPath(normalized),
      upsert: true,
      // Files are replaced in place (a re-recorded page keeps its name), so
      // browsers must revalidate instead of replaying a stale copy.
      cacheControl: "0",
    });
    if (error) throw new Error(`[supabase] upload ${normalized}: ${error.message}`);
    return { path: normalized, url: this.url(normalized) };
  }

  async get(mediaPath: string): Promise<MediaObject | null> {
    const normalized = normalizeMediaPath(mediaPath);
    const { data, error } = await this.db.storage.from(bucketForPath(normalized)).download(normalized);
    if (error) {
      if (isMissing(error as { message?: string; status?: number })) return null;
      throw new Error(`[supabase] download ${normalized}: ${error.message}`);
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    return { bytes, contentType: data.type || contentTypeForPath(normalized), size: bytes.byteLength };
  }

  async delete(mediaPath: string): Promise<void> {
    const normalized = normalizeMediaPath(mediaPath);
    const { error } = await this.db.storage.from(bucketForPath(normalized)).remove([normalized]);
    if (error) throw new Error(`[supabase] delete ${normalized}: ${error.message}`);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const normalized = normalizeMediaPath(prefix);
    for (const bucket of BUCKETS) {
      const paths = await this.listBucket(bucket, normalized);
      for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const { error } = await this.db.storage.from(bucket).remove(paths.slice(i, i + REMOVE_CHUNK));
        if (error) throw new Error(`[supabase] delete ${normalized}: ${error.message}`);
      }
    }
  }

  async list(prefix: string): Promise<string[]> {
    const normalized = normalizeMediaPath(prefix);
    const found: string[] = [];
    for (const bucket of BUCKETS) found.push(...(await this.listBucket(bucket, normalized)));
    return found.sort();
  }

  /** The site's own /media route: it authorises the request, then redirects to a signed URL. */
  url(mediaPath: string): string {
    return mediaUrl(normalizeMediaPath(mediaPath));
  }

  /**
   * A direct download URL that stops working after `expiresInSeconds`. Call it
   * only for a request that was already authorised. Null when the file is missing.
   */
  async signedUrl(mediaPath: string, expiresInSeconds: number): Promise<string | null> {
    const normalized = normalizeMediaPath(mediaPath);
    const { data, error } = await this.db.storage
      .from(bucketForPath(normalized))
      .createSignedUrl(normalized, expiresInSeconds);
    if (error) {
      if (isMissing(error as { message?: string; status?: number })) return null;
      throw new Error(`[supabase] sign ${normalized}: ${error.message}`);
    }
    const signed = data?.signedUrl;
    if (!signed) return null;
    // supabase-js returns an absolute URL; tolerate a relative one.
    return /^https?:/.test(signed) ? signed : `${this.baseUrl}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  }

  /** Recursive listing of one bucket folder. Folders are the entries without an id. */
  private async listBucket(bucket: string, folder: string): Promise<string[]> {
    const found: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await this.db.storage
        .from(bucket)
        .list(folder, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`[supabase] list ${bucket}/${folder}: ${error.message}`);
      for (const entry of data) {
        const child = `${folder}/${entry.name}`;
        if (entry.id === null) found.push(...(await this.listBucket(bucket, child)));
        else found.push(child);
      }
      if (data.length < LIST_PAGE) break;
    }
    return found;
  }
}

export async function createSupabaseMediaStore(): Promise<MediaStore> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseMediaStore(getSupabaseAdmin(), config.url.replace(/\/+$/, ""));
}
