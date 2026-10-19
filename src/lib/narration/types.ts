/**
 * Narration types. Client-safe (types only), so the studio can import them to
 * read the progress stream of POST /api/narration/<bookId>.
 */
import type { AudioSource } from "../types";

export interface NarrationOptions {
  /** Narrate again even when the stored audio already matches the text. */
  force?: boolean;
  /** Vendor voice id; defaults to the book's hero.narrationVoice, then the provider's configured voice. */
  voice?: string;
  /** 1 = normal speed. */
  speed?: number;
  /** Narration style preset slug (NARRATION_STYLES); the pipeline falls back to the book's hero.narrationStyle. */
  style?: string;
  /** Free-text narration wishes, at most 300 characters. Gemini honours them; ElevenLabs ignores them. */
  notes?: string;
  /** Replace a parent's own recording. Off by default: a recording is never overwritten silently. */
  overwriteRecorded?: boolean;
}

export type PageNarrationStatus = "narrated" | "skipped" | "failed";

/**
 * Why a page was skipped:
 *   up-to-date       audio and word timings already match the text
 *   empty            the page has no text
 *   recorded         the page has a human recording
 *   kept-real-audio  only the demo voice is available and the page already has real audio
 *   stale            the page text changed while it was being narrated; nothing was stored
 */
export type PageSkipReason = "up-to-date" | "empty" | "recorded" | "kept-real-audio" | "stale";

export interface PageNarrationResult {
  bookId: string;
  /** Zero-based. */
  pageIndex: number;
  status: PageNarrationStatus;
  reason?: PageSkipReason;
  /** Media path of the stored audio (when narrated). */
  audio?: string;
  /** "mock" means a silent demo track: show <MockNotice kind="tts" />. */
  audioSource?: AudioSource;
  wordCount: number;
  durationSeconds?: number;
  /** True when this run stored a new textNikud for the page. */
  nikudAdded: boolean;
  /** Non-fatal problems, in English (for logs). */
  warnings: string[];
  /** Set when status is "failed". */
  error?: string;
}

export interface BookNarrationSummary {
  bookId: string;
  total: number;
  narrated: number;
  skipped: number;
  failed: number;
  ttsProvider: string;
  nikudProvider: string;
  /** True when the audio produced by this run is the silent demo voice. */
  ttsMock: boolean;
  /** True when no real vocalization service is configured (text is left as is). */
  nikudMock: boolean;
  /** True when the run was stopped before all pages were handled. */
  aborted: boolean;
  results: PageNarrationResult[];
}

/**
 * Lines of the NDJSON progress stream (one JSON object per line,
 * Content-Type application/x-ndjson):
 *
 *   {"type":"start", ...}            once
 *   {"type":"page", ...}             once per page, in order
 *   {"type":"done","summary":{...}}  last line on success
 *   {"type":"error","error":"..."}   last line when the run itself broke
 */
export type NarrationEvent =
  | {
      type: "start";
      bookId: string;
      total: number;
      ttsProvider: string;
      nikudProvider: string;
      ttsMock: boolean;
      nikudMock: boolean;
      /** True when narration notes were sent but the TTS provider cannot use free text (ElevenLabs). */
      styleNotesIgnored?: boolean;
    }
  | { type: "page"; done: number; total: number; result: PageNarrationResult }
  | { type: "done"; summary: BookNarrationSummary }
  | { type: "error"; error: string };

/** What GET /api/narration/<bookId> returns for each page. */
export interface PageNarrationState {
  pageIndex: number;
  hasText: boolean;
  hasAudio: boolean;
  audioSource?: AudioSource;
  /** Audio and word timings match the current text. */
  upToDate: boolean;
  hasNikud: boolean;
}
