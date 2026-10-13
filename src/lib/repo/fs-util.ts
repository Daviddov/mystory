import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

export function isNotFound(err: unknown): boolean {
  return isNodeError(err) && (err.code === "ENOENT" || err.code === "ENOTDIR");
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  // On Windows a rename can briefly fail while another handle is open on the target.
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      lastError = err;
      if (!isNodeError(err) || !["EPERM", "EBUSY", "EACCES"].includes(err.code ?? "")) break;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Write to a temp file in the same folder, then rename over the target. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await fs.writeFile(tmp, data);
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n");
}

/** Returns undefined when the file does not exist. Throws on invalid JSON. */
export async function readJson(file: string): Promise<unknown | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
  return JSON.parse(raw.replace(/^﻿/, ""));
}

export async function renameDir(from: string, to: string): Promise<void> {
  await renameWithRetry(from, to);
}

/** Serializes async tasks: each task starts after the previous one settles. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
