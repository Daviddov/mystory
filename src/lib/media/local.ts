import { promises as fs } from "node:fs";
import path from "node:path";
import { isNotFound, writeFileAtomic } from "../repo/fs-util";
import type { MediaObject, MediaStore } from "./types";
import { contentTypeForPath, InvalidMediaPathError, mediaUrl, normalizeMediaPath } from "./url";

/** Files under <dataDir>/media. The content type is derived from the extension. */
export class LocalMediaStore implements MediaStore {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(dataRoot: string) {
    this.root = path.resolve(dataRoot, "media");
  }

  /** Absolute file path for a media path, guaranteed to stay inside the media root. */
  resolve(mediaPath: string): string {
    const normalized = normalizeMediaPath(mediaPath);
    const absolute = path.resolve(this.root, ...normalized.split("/"));
    if (!absolute.startsWith(this.root + path.sep)) throw new InvalidMediaPathError(mediaPath);
    return absolute;
  }

  async put(mediaPath: string, bytes: Uint8Array, contentType: string) {
    void contentType;
    const normalized = normalizeMediaPath(mediaPath);
    await writeFileAtomic(this.resolve(normalized), bytes);
    return { path: normalized, url: this.url(normalized) };
  }

  async get(mediaPath: string): Promise<MediaObject | null> {
    const file = this.resolve(mediaPath);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return null;
      const buffer = await fs.readFile(file);
      return {
        bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        contentType: contentTypeForPath(mediaPath),
        size: buffer.byteLength,
        mtimeMs: stat.mtimeMs,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(mediaPath: string): Promise<void> {
    await fs.rm(this.resolve(mediaPath), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(this.resolve(prefix), { recursive: true, force: true });
  }

  async list(prefix: string): Promise<string[]> {
    const normalized = normalizeMediaPath(prefix);
    const start = this.resolve(normalized);
    const found: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (isNotFound(err)) return;
        throw err;
      }
      for (const entry of entries) {
        if (entry.name.endsWith(".tmp") && entry.name.startsWith(".")) continue;
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), childRel);
        else if (entry.isFile()) found.push(childRel);
      }
    };
    await walk(start, normalized);
    return found.sort();
  }

  url(mediaPath: string): string {
    return mediaUrl(normalizeMediaPath(mediaPath));
  }
}
