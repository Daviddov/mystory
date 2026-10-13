/**
 * Browser helpers for the import page: reading dropped folders and shrinking
 * large photos before upload. BROWSER ONLY.
 */
import { sortByNaturalPath } from "./natural-sort";

export interface PickedFile {
  file: File;
  /** Path inside the dropped or selected folder ("book/page-1.png"); the bare name otherwise. */
  path: string;
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    // readEntries returns the folder in batches; an empty batch means the end.
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

async function walkEntry(entry: FileSystemEntry, out: PickedFile[], limit: number): Promise<void> {
  if (out.length >= limit) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path: entry.fullPath.replace(/^\//, "") || file.name });
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walkEntry(child, out, limit);
  }
}

/** Files of a drop event, including the contents of dropped folders (recursively). */
export async function filesFromDrop(dataTransfer: DataTransfer, limit = 2000): Promise<PickedFile[]> {
  // Entries must be collected synchronously; the item list is emptied after the event handler returns.
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }
  if (entries.length === 0 && loose.length === 0) loose.push(...Array.from(dataTransfer.files ?? []));

  const out: PickedFile[] = loose.map((file) => ({ file, path: file.name }));
  for (const entry of entries) await walkEntry(entry, out, limit);
  return out;
}

/** Files of an <input type="file"> (with or without webkitdirectory). */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return Array.from(list ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

/** Natural filename order: "2.png" before "10.png", folder by folder. */
export function sortPickedFiles(files: readonly PickedFile[]): PickedFile[] {
  return sortByNaturalPath(files, (picked) => picked.path);
}

/**
 * Draws an image file on a canvas no larger than `maxEdge` and returns it as
 * JPEG. Returns null when the browser cannot decode the file.
 */
export async function rasterizeImage(file: Blob, maxEdge: number, quality = 0.88): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  } finally {
    bitmap.close();
  }
}

const KEEP_AS_IS = new Set(["image/svg+xml", "image/gif"]);

/**
 * Shrinks big photos (phone cameras produce 5-10MB files) so a whole book fits
 * in one upload. Small images, SVG and GIF are returned unchanged, as is any
 * file the browser cannot decode (the server then decides whether to accept it).
 */
export async function prepareImageForUpload(file: Blob, maxEdge = 1600, keepBelowBytes = 700 * 1024): Promise<Blob> {
  if (KEEP_AS_IS.has(file.type) || file.size <= keepBelowBytes) return file;
  const smaller = await rasterizeImage(file, maxEdge);
  return smaller && smaller.size < file.size ? smaller : file;
}
