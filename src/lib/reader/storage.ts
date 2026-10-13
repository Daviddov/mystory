/**
 * Device-local reader state (localStorage). Every function tolerates missing
 * or blocked storage and corrupt values, so the reader works in private mode.
 */
import { z } from "zod";
import { FONT_SIZES_REM, PLAYBACK_RATES, type StoredProgress } from "./logic";

const PROGRESS_PREFIX = "mystory:progress:";
const PREFS_KEY = "mystory:reader-prefs";

const StoredProgressSchema = z.object({
  pageIndex: z.number().int().min(0),
  completed: z.boolean(),
  updatedAt: z.string().min(1),
});

const ReaderPrefsSchema = z.object({
  /** Index into FONT_SIZES_REM. Missing = default for the book's age group. */
  fontStep: z
    .number()
    .int()
    .min(0)
    .max(FONT_SIZES_REM.length - 1)
    .optional(),
  nikud: z.boolean().optional(),
  /** Show a translated book in the language it was written in. */
  original: z.boolean().optional(),
  rate: z
    .number()
    .refine((value) => (PLAYBACK_RATES as readonly number[]).includes(value))
    .optional(),
  autoAdvance: z.boolean().optional(),
});
export type ReaderPrefs = z.infer<typeof ReaderPrefsSchema>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the position is simply not remembered.
  }
}

export function loadLocalProgress(bookId: string): StoredProgress | null {
  const parsed = StoredProgressSchema.safeParse(readJson(PROGRESS_PREFIX + bookId));
  return parsed.success ? parsed.data : null;
}

export function saveLocalProgress(bookId: string, pageIndex: number, completed: boolean): void {
  writeJson(PROGRESS_PREFIX + bookId, {
    pageIndex,
    completed,
    updatedAt: new Date().toISOString(),
  } satisfies StoredProgress);
}

export function loadReaderPrefs(): ReaderPrefs {
  const parsed = ReaderPrefsSchema.safeParse(readJson(PREFS_KEY));
  return parsed.success ? parsed.data : {};
}

export function saveReaderPrefs(prefs: ReaderPrefs): void {
  writeJson(PREFS_KEY, prefs);
}
