/**
 * Media storage entry point. Server only.
 *
 *   const store = await getMediaStore();
 *   const { path } = await store.put(bookMediaPath(book.id, "page-1.png"), bytes, "image/png");
 *   // save `path` in page.image, render with mediaUrl(path)
 */
import "server-only";
import { dataDir, isSupabaseConfigured } from "../config";
import { LocalMediaStore } from "./local";
import type { MediaStore } from "./types";

export * from "./types";
export * from "./url";
export { LocalMediaStore } from "./local";

interface MediaGlobal {
  __mystoryMedia?: { key: string; store: Promise<MediaStore> };
}

const globalRef = globalThis as unknown as MediaGlobal;

export function getMediaStore(): Promise<MediaStore> {
  const key = isSupabaseConfigured() ? "supabase" : `local:${dataDir()}`;
  const cached = globalRef.__mystoryMedia;
  if (cached && cached.key === key) return cached.store;

  const store: Promise<MediaStore> = isSupabaseConfigured()
    ? import("./supabase").then((mod) => mod.createSupabaseMediaStore())
    : Promise.resolve(new LocalMediaStore(dataDir()));
  globalRef.__mystoryMedia = { key, store };
  store.catch(() => {
    if (globalRef.__mystoryMedia?.store === store) globalRef.__mystoryMedia = undefined;
  });
  return store;
}
