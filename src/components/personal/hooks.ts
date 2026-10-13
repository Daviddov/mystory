"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  toggleFavorite,
  type LocalProgress,
  type PersonalSnapshot,
} from "./local-store";

/** Favorites and reading progress of this device (mirrors the account when signed in). */
export function usePersonal(): PersonalSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `[isFavorite, toggle]` for one book. `isFavorite` is false during server rendering. */
export function useFavorite(bookId: string): [boolean, () => void] {
  const personal = usePersonal();
  const toggle = useCallback(() => {
    toggleFavorite(bookId);
  }, [bookId]);
  return [personal.favorites.some((f) => f.bookId === bookId), toggle];
}

/** The saved reading position of one book, if any. */
export function useProgress(bookId: string): LocalProgress | undefined {
  return usePersonal().progress.find((p) => p.bookId === bookId);
}
