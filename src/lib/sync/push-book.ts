/**
 * Pushes ONE local book (fields, pages and media files) to the Supabase
 * project described in `.env.supabase`, from a local dev server that runs on
 * the JSON repository. Server only; never available in production or when the
 * app itself already runs on Supabase.
 *
 * The Supabase credentials are read from the file and used for a private
 * client: process.env is not touched, so the app keeps running locally.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/config";
import { getMediaStore } from "@/lib/media";
import { SupabaseMediaStore } from "@/lib/media/supabase";
import { bookMediaPrefix, contentTypeForPath } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { SupabaseRepository } from "@/lib/repo/supabase";
import { NotFoundError, type BookPatch } from "@/lib/repo/types";
import type { BookWithPages } from "@/lib/types";

const ENV_FILE = ".env.supabase";
/** Never compared or written: Supabase keeps its own counter and timestamps. */
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "viewCount", "pages"]);

export interface BookPushPlan {
  bookId: string;
  title: string;
  status: string;
  /** What happens to the book row and pages. */
  action: "create" | "update" | "same";
  /** Book fields that differ (update only). */
  fields: string[];
  /** One-based numbers of pages that differ (update only). */
  pages: number[];
  /** Media paths missing in Supabase. */
  upload: string[];
  /** Media paths in Supabase that no longer exist locally. */
  remove: string[];
  /** Supabase changed this book after the local copy; pushing overwrites those edits. */
  remoteIsNewer: boolean;
}

export interface BookPushResult extends BookPushPlan {
  applied: true;
}

interface Target {
  repo: SupabaseRepository;
  media: SupabaseMediaStore;
}

async function readTargetEnv(): Promise<{ url: string; serviceRoleKey: string } | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(process.cwd(), ENV_FILE), "utf8");
  } catch {
    return null;
  }
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = values.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

/** True on a local dev server with a `.env.supabase` file; the push button shows only then. */
export async function isBookPushAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || isSupabaseConfigured()) return false;
  return (await readTargetEnv()) !== null;
}

async function openTarget(): Promise<Target> {
  if (!(await isBookPushAvailable())) {
    throw new Error(`Pushing a book needs a local dev server and a ${ENV_FILE} file with the Supabase keys.`);
  }
  const env = (await readTargetEnv())!;
  const client = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { repo: new SupabaseRepository(client), media: new SupabaseMediaStore(client, env.url.replace(/\/+$/, "")) };
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined && x !== null)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return v;
  });
}

function changedFields(local: BookWithPages, remote: BookWithPages): string[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  return [...keys].filter((key) => {
    if (IGNORED_FIELDS.has(key)) return false;
    const a = (local as unknown as Record<string, unknown>)[key];
    const b = (remote as unknown as Record<string, unknown>)[key];
    return stable(a) !== stable(b);
  });
}

function changedPages(local: BookWithPages, remote: BookWithPages): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(local.pages.length, remote.pages.length); i++) {
    if (stable(local.pages[i]) !== stable(remote.pages[i])) out.push(i + 1);
  }
  return out;
}

/** Compares the local book with Supabase and changes nothing. */
export async function planBookPush(bookId: string): Promise<BookPushPlan> {
  const target = await openTarget();
  return plan(bookId, target);
}

async function plan(bookId: string, target: Target): Promise<BookPushPlan> {
  const [localRepo, localMedia] = await Promise.all([getRepo(), getMediaStore()]);
  const local = await localRepo.getBookById(bookId);
  if (!local) throw new NotFoundError(`book ${bookId}`);
  const remote = await target.repo.getBookById(bookId);

  const prefix = bookMediaPrefix(bookId);
  const localPaths = await localMedia.list(prefix);
  const remotePaths = await target.media.list(prefix);
  const remoteSet = new Set(remotePaths);
  const localSet = new Set(localPaths);

  const fields = remote ? changedFields(local, remote) : [];
  const pages = remote ? changedPages(local, remote) : [];
  return {
    bookId,
    title: local.title,
    status: local.status,
    action: !remote ? "create" : fields.length || pages.length ? "update" : "same",
    fields,
    pages,
    upload: localPaths.filter((p) => !remoteSet.has(p)),
    remove: remotePaths.filter((p) => !localSet.has(p)),
    remoteIsNewer: remote ? Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) : false,
  };
}

/** Makes the book in Supabase match the local one: media first, then the book, stale files last. */
export async function pushBook(bookId: string): Promise<BookPushResult> {
  const target = await openTarget();
  const steps = await plan(bookId, target);
  const [localRepo, localMedia] = await Promise.all([getRepo(), getMediaStore()]);
  const local = (await localRepo.getBookById(bookId))!;

  for (const mediaPath of steps.upload) {
    const object = await localMedia.get(mediaPath);
    if (object) await target.media.put(mediaPath, object.bytes, contentTypeForPath(mediaPath));
  }

  if (steps.action === "create") {
    const { createdAt: _c, updatedAt: _u, ...input } = local;
    await target.repo.createBook(input);
  } else if (steps.action === "update") {
    if (steps.fields.length) {
      const patch: Record<string, unknown> = {};
      for (const key of steps.fields) patch[key] = (local as unknown as Record<string, unknown>)[key];
      await target.repo.updateBook(bookId, patch as BookPatch);
    }
    if (steps.pages.length) await target.repo.replacePages(bookId, local.pages);
  }

  for (const mediaPath of steps.remove) await target.media.delete(mediaPath);
  return { ...steps, applied: true };
}
