"use client";

import { useEffect, useMemo, useState } from "react";
import { patchBookMeta, putBookPages, StudioApiError } from "@/lib/studio/client";
import type { BookMetaPatch } from "@/lib/studio/shared";
import type { BookWithPages, Page } from "@/lib/types";

export type SaveState = "saved" | "dirty" | "saving" | "error";

type ServerPage = Omit<Page, "index">;

export interface Autosave {
  state: SaveState;
  /** Hebrew message of the last failed save. */
  error: string | null;
  /**
   * True when the server refused a save because the book changed elsewhere
   * (another tab, another device, an editor). Saving stops until a reload.
   */
  conflict: boolean;
  /** Tells the queue which version of the book this tab now has (after any server response). */
  setBase: (updatedAt: string) => void;
  /** Drops everything pending, before a reload that gives up the unsaved edits. */
  discard: () => void;
  /** Merges fields into the pending metadata patch and schedules a save. */
  markMeta: (patch: BookMetaPatch) => void;
  /** Replaces the pending pages snapshot and schedules a save. */
  markPages: (pages: ServerPage[]) => void;
  /** Saves everything pending now. Resolves true when the server has it all. */
  flush: () => Promise<boolean>;
}

const DEBOUNCE_MS = 900;
const RETRY_MS = 6000;

interface Snapshot {
  state: SaveState;
  error: string | null;
  conflict?: boolean;
}

/**
 * Debounced save queue for one book. Metadata and pages are tracked
 * separately; saves run one at a time, and changes made while a save is in
 * flight go out in the next one. A failed save keeps its data pending and is
 * retried when retrying can help (network or server error).
 *
 * Every save carries the `updatedAt` this tab last saw. When the server answers
 * that the book changed elsewhere, the queue stops saving for good: sending the
 * stale snapshot again could only overwrite the other writer.
 */
export class AutosaveQueue {
  private onChange: (snapshot: Snapshot) => void = () => {};
  private onSaved: (book: BookWithPages) => void = () => {};

  private pendingMeta: BookMetaPatch | null = null;
  private pendingPages: ServerPage[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<boolean> = Promise.resolve(true);
  private saving = false;
  private active = true;
  private conflicted = false;

  constructor(
    private readonly bookId: string,
    private readonly api: {
      patchMeta: (id: string, patch: BookMetaPatch, baseUpdatedAt?: string) => Promise<BookWithPages>;
      putPages: (id: string, pages: ServerPage[], baseUpdatedAt?: string) => Promise<BookWithPages>;
    } = { patchMeta: patchBookMeta, putPages: putBookPages },
    /** The `updatedAt` of the book as this tab loaded it. */
    private base?: string,
  ) {}

  /** The version of the book this tab has now; every later save is based on it. */
  setBase = (updatedAt: string): void => {
    if (updatedAt) this.base = updatedAt;
  };

  get hasConflict(): boolean {
    return this.conflicted;
  }

  /** Forgets everything pending (used before a reload after a conflict). */
  discard = (): void => {
    this.clearTimer();
    this.pendingMeta = null;
    this.pendingPages = null;
  };

  /** Registers who hears about state changes and about each book the server returns. */
  listen(handlers: { onChange?: (snapshot: Snapshot) => void; onSaved?: (book: BookWithPages) => void }): void {
    if (handlers.onChange) this.onChange = handlers.onChange;
    if (handlers.onSaved) this.onSaved = handlers.onSaved;
  }

  get hasPending(): boolean {
    return this.pendingMeta !== null || this.pendingPages !== null;
  }

  markMeta = (patch: BookMetaPatch): void => {
    this.pendingMeta = { ...this.pendingMeta, ...patch };
    this.schedule(DEBOUNCE_MS);
  };

  markPages = (pages: ServerPage[]): void => {
    this.pendingPages = pages;
    this.schedule(DEBOUNCE_MS);
  };

  flush = (): Promise<boolean> => {
    this.clearTimer();
    if (this.conflicted) return Promise.resolve(false);
    const run = () => this.drain();
    this.chain = this.chain.then(run, run).catch(() => false);
    return this.chain;
  };

  /** Stops timers and state updates; `resume` undoes it (React runs effects twice in development). */
  suspend(): void {
    this.active = false;
    this.clearTimer();
  }

  resume(): void {
    this.active = true;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number): void {
    if (this.conflicted) return; // nothing more is sent from this tab
    if (!this.saving) this.emit("dirty", null);
    this.clearTimer();
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  private emit(state: SaveState, error: string | null, conflict = false): void {
    if (this.active) this.onChange({ state, error, conflict });
  }

  private async drain(): Promise<boolean> {
    while (this.pendingMeta || this.pendingPages) {
      const meta = this.pendingMeta;
      const pages = this.pendingPages;
      this.pendingMeta = null;
      this.pendingPages = null;
      this.saving = true;
      this.emit("saving", null);
      let metaDone = false;
      try {
        let saved: BookWithPages | null = null;
        if (meta) {
          saved = await this.api.patchMeta(this.bookId, meta, this.base);
          metaDone = true;
          this.setBase(saved.updatedAt);
        }
        if (pages) {
          saved = await this.api.putPages(this.bookId, pages, this.base);
          this.setBase(saved.updatedAt);
        }
        if (saved && this.active) this.onSaved(saved);
      } catch (err) {
        this.saving = false;
        // Keep what was not saved; edits made in the meantime win over it.
        const newerMeta = this.pendingMeta as BookMetaPatch | null;
        const newerPages = this.pendingPages as ServerPage[] | null;
        if (meta && !metaDone) this.pendingMeta = { ...meta, ...newerMeta };
        if (pages) this.pendingPages = newerPages ?? pages;
        const apiError = err instanceof StudioApiError ? err : null;
        if (apiError?.conflict) {
          this.conflicted = true;
          this.clearTimer();
          this.emit("error", apiError.message, true);
          return false;
        }
        this.emit("error", apiError?.message ?? "השמירה נכשלה");
        if (this.active && (!apiError || apiError.retryable)) {
          this.clearTimer();
          this.timer = setTimeout(() => void this.flush(), RETRY_MS);
        }
        return false;
      }
      this.saving = false;
    }
    this.emit("saved", null);
    return true;
  }
}

/** Autosave for the studio editor, with a visible state. One queue per book id. */
export function useAutosave(
  bookId: string,
  onSaved: (book: BookWithPages) => void,
  /** The `updatedAt` of the book as the page loaded it. */
  initialUpdatedAt?: string,
): Autosave {
  // The initial version is only read when the queue is created; later versions arrive through setBase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => new AutosaveQueue(bookId, undefined, initialUpdatedAt), [bookId]);
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: "saved", error: null });

  useEffect(() => {
    queue.listen({ onSaved });
  }, [queue, onSaved]);

  useEffect(() => {
    queue.listen({ onChange: setSnapshot });
    queue.resume();

    // Save when the tab is hidden or closed, and warn when closing with unsaved work.
    const onHide = () => {
      if (document.visibilityState === "hidden" && queue.hasPending) void queue.flush();
    };
    const onPageHide = () => {
      if (queue.hasPending) void queue.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // After a conflict nothing can be saved from this tab, so there is nothing to warn about.
      if (queue.hasPending && !queue.hasConflict) {
        void queue.flush();
        event.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Leaving the editor inside the site (client navigation): send what is pending.
      if (queue.hasPending) void queue.flush();
      queue.suspend();
    };
  }, [queue]);

  return {
    state: snapshot.state,
    error: snapshot.error,
    conflict: snapshot.conflict === true,
    setBase: queue.setBase,
    discard: queue.discard,
    markMeta: queue.markMeta,
    markPages: queue.markPages,
    flush: queue.flush,
  };
}
