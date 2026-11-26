/**
 * How many books a visitor without an account may open in the reader. Client-safe.
 *
 * The books are remembered on the device (localStorage), so this is a gentle
 * nudge to sign up, not access control: clearing site data starts over. A book
 * already opened stays open, so a child can go back to a favourite.
 */
import { z } from "zod";

export const GUEST_BOOK_LIMIT = 3;

const STORAGE_KEY = "mystory:guest-books";
const ListSchema = z.array(z.string().min(1)).max(1000);

/** True when `bookId` may be read: it was opened before, or the limit is not reached yet. */
export function guestMayRead(opened: readonly string[], bookId: string, limit = GUEST_BOOK_LIMIT): boolean {
  return opened.includes(bookId) || opened.length < limit;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The books this device opened without an account. Blocked or corrupt storage reads as none. */
export function loadGuestBooks(): string[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = ListSchema.safeParse(raw ? JSON.parse(raw) : []);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Remembers `bookId` as opened (once). Without storage nothing is remembered, and reading goes on. */
export function rememberGuestBook(bookId: string): void {
  const opened = loadGuestBooks();
  if (opened.includes(bookId)) return;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify([...opened, bookId]));
  } catch {
    // Storage full or blocked.
  }
}

/** Subscribes to changes made in other tabs. */
export function subscribeGuestBooks(onChange: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
