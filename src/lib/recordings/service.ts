/**
 * Family recordings: a reader narrates a book in their own voice, page by
 * page, from the reader. The recording is theirs (on "המדף שלי") until they
 * send it for sharing; an editor then approves it, and every reader of the
 * book can pick it as a narration version. Server only.
 *
 * Changing the audio of a recording that is waiting or approved takes it back
 * to private: what the editors approved is exactly what readers hear.
 */
import "server-only";
import { canViewBook, hasRole } from "../auth";
import { recordingMediaPrefix } from "../media/access";
import type { MediaStore } from "../media/types";
import { newId } from "../ids";
import type { Repository } from "../repo/types";
import { AUDIO_MAX_BYTES } from "../studio/shared";
import { sniffMedia } from "../studio/upload";
import { RECORDING_TITLE_MAX, type BookWithPages, type Recording, type RecordingStatus, type User, type WordTiming } from "../types";

export class RecordingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RecordingError";
  }
}

export interface RecordingContext {
  repo: Repository;
  media: MediaStore;
  user: User;
}

/** Recordings one person may keep of one book. */
export const MAX_RECORDINGS_PER_BOOK = 5;
export const DEFAULT_RECORDING_TITLE = "ההקלטה שלי";

/** What the reader and the shelf receive. The recorder's account id is never sent. */
export interface RecordingView {
  id: string;
  bookId: string;
  title: string;
  status: RecordingStatus;
  /** True for the signed-in reader's own recordings. */
  mine: boolean;
  reviewNote?: string;
  pages: { index: number; audio: string; wordTimings?: WordTiming[] }[];
  updatedAt: string;
}

export function toRecordingView(recording: Recording, viewer: Pick<User, "id"> | null): RecordingView {
  const mine = viewer !== null && viewer.id === recording.userId;
  return {
    id: recording.id,
    bookId: recording.bookId,
    title: recording.title,
    status: recording.status,
    mine,
    reviewNote: mine ? recording.reviewNote : undefined,
    pages: recording.pages.map((page) => ({
      index: page.index,
      audio: page.audio,
      ...(page.wordTimings ? { wordTimings: page.wordTimings } : {}),
    })),
    updatedAt: recording.updatedAt,
  };
}

function cleanTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (title.length === 0) return DEFAULT_RECORDING_TITLE;
  if (title.length > RECORDING_TITLE_MAX) {
    throw new RecordingError(400, `השם ארוך מדי. אפשר עד ${RECORDING_TITLE_MAX} תווים.`);
  }
  return title;
}

async function loadBook(ctx: RecordingContext, bookId: string, shareToken?: string | null): Promise<BookWithPages> {
  const book = await ctx.repo.getBookById(bookId);
  if (!book || !canViewBook(book, ctx.user, shareToken)) throw new RecordingError(404, "הספר לא נמצא");
  return book;
}

async function loadOwn(ctx: RecordingContext, id: string): Promise<Recording> {
  const recording = await ctx.repo.getRecording(id);
  if (!recording || recording.userId !== ctx.user.id) throw new RecordingError(404, "ההקלטה לא נמצאה");
  return recording;
}

/** The recordings a reader may choose from: approved ones, plus the reader's own. */
export async function recordingsForReader(
  repo: Repository,
  bookId: string,
  user: Pick<User, "id"> | null,
): Promise<RecordingView[]> {
  const [approved, own] = await Promise.all([
    repo.listRecordings({ bookId, status: "approved" }),
    user ? repo.listRecordings({ bookId, userId: user.id }) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const views: RecordingView[] = [];
  // Own recordings first, then the shared ones (oldest approval first).
  for (const recording of [...own, ...approved.reverse()]) {
    if (seen.has(recording.id) || (recording.pages.length === 0 && recording.userId !== user?.id)) continue;
    seen.add(recording.id);
    views.push(toRecordingView(recording, user));
  }
  return views;
}

export async function createRecording(
  ctx: RecordingContext,
  input: { bookId: string; title?: unknown; shareToken?: string | null },
): Promise<Recording> {
  const book = await loadBook(ctx, input.bookId, input.shareToken);
  if (book.pages.length === 0) throw new RecordingError(400, "בספר הזה אין עמודים להקליט");
  const own = await ctx.repo.listRecordings({
    bookId: book.id,
    userId: ctx.user.id,
  });
  if (own.length >= MAX_RECORDINGS_PER_BOOK) {
    throw new RecordingError(409, `אפשר לשמור עד ${MAX_RECORDINGS_PER_BOOK} הקלטות לכל ספר. מחקו הקלטה ישנה ונסו שוב.`);
  }
  return ctx.repo.createRecording({
    bookId: book.id,
    userId: ctx.user.id,
    title: cleanTitle(input.title),
  });
}

/** Stores the audio of one page, replacing an earlier take. */
export async function saveRecordingPage(
  ctx: RecordingContext,
  id: string,
  pageIndex: number,
  bytes: Uint8Array,
): Promise<Recording> {
  const recording = await loadOwn(ctx, id);
  const book = await ctx.repo.getBookById(recording.bookId);
  if (!book) throw new RecordingError(404, "הספר לא נמצא");
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= book.pages.length) {
    throw new RecordingError(400, "אין בספר עמוד כזה");
  }
  if (bytes.byteLength === 0) throw new RecordingError(400, "ההקלטה ריקה");
  if (bytes.byteLength > AUDIO_MAX_BYTES) throw new RecordingError(413, "ההקלטה ארוכה מדי");
  const sniffed = sniffMedia(bytes);
  if (!sniffed || sniffed.kind !== "audio") throw new RecordingError(415, "סוג ההקלטה לא נתמך");

  const audio = `${recordingMediaPrefix(book.id, recording.id)}/p${pageIndex + 1}-${newId()}.${sniffed.ext}`;
  await ctx.media.put(audio, bytes, sniffed.contentType);
  const previous = recording.pages.find((page) => page.index === pageIndex);
  const pages = [...recording.pages.filter((page) => page.index !== pageIndex), { index: pageIndex, audio }].sort(
    (a, b) => a.index - b.index,
  );
  const next = await ctx.repo.updateRecording(id, {
    pages,
    ...backToPrivate(recording),
  });
  if (previous) await ctx.media.delete(previous.audio).catch(() => undefined);
  return next;
}

export async function deleteRecordingPage(ctx: RecordingContext, id: string, pageIndex: number): Promise<Recording> {
  const recording = await loadOwn(ctx, id);
  const previous = recording.pages.find((page) => page.index === pageIndex);
  if (!previous) return recording;
  const next = await ctx.repo.updateRecording(id, {
    pages: recording.pages.filter((page) => page.index !== pageIndex),
    ...backToPrivate(recording),
  });
  await ctx.media.delete(previous.audio).catch(() => undefined);
  return next;
}

function backToPrivate(recording: Recording): Partial<Recording> {
  return recording.status === "private" ? {} : { status: "private", submittedAt: undefined };
}

export async function renameRecording(ctx: RecordingContext, id: string, title: unknown): Promise<Recording> {
  await loadOwn(ctx, id);
  return ctx.repo.updateRecording(id, { title: cleanTitle(title) });
}

/** "Share with everyone": puts the recording in the admin queue. */
export async function submitRecording(ctx: RecordingContext, id: string): Promise<Recording> {
  const recording = await loadOwn(ctx, id);
  if (recording.status !== "private") return recording;
  if (recording.pages.length === 0) throw new RecordingError(400, "עוד לא הוקלט אף עמוד");
  const book = await ctx.repo.getBookById(recording.bookId);
  if (!book || book.status !== "published") {
    throw new RecordingError(409, "אפשר לשתף הקלטה רק של ספר שפורסם בספרייה");
  }
  return ctx.repo.updateRecording(id, {
    status: "pending",
    submittedAt: new Date().toISOString(),
    reviewNote: undefined,
  });
}

/** Stops sharing: a waiting or approved recording goes back to private. */
export async function withdrawRecording(ctx: RecordingContext, id: string): Promise<Recording> {
  const recording = await loadOwn(ctx, id);
  if (recording.status === "private") return recording;
  return ctx.repo.updateRecording(id, {
    status: "private",
    submittedAt: undefined,
  });
}

export async function deleteRecording(ctx: RecordingContext, id: string): Promise<void> {
  const recording = await ctx.repo.getRecording(id);
  if (!recording) return;
  if (recording.userId !== ctx.user.id && !hasRole(ctx.user, "admin")) {
    throw new RecordingError(404, "ההקלטה לא נמצאה");
  }
  await ctx.repo.deleteRecording(id);
  await ctx.media.deletePrefix(recordingMediaPrefix(recording.bookId, recording.id)).catch(() => undefined);
}

export type RecordingReview = { action: "approve"; updatedAt?: string } | { action: "reject"; note: string };

/** Editors decide on a recording that waits in the queue. */
export async function reviewRecording(
  repo: Repository,
  user: User,
  id: string,
  review: RecordingReview,
): Promise<Recording> {
  if (!hasRole(user, "editor")) throw new RecordingError(403, "אין הרשאה");
  const recording = await repo.getRecording(id);
  if (!recording) throw new RecordingError(404, "ההקלטה לא נמצאה");
  if (recording.status !== "pending") throw new RecordingError(409, "ההקלטה כבר לא ממתינה לאישור");
  if (review.action === "approve") {
    if (review.updatedAt && review.updatedAt !== recording.updatedAt) {
      throw new RecordingError(409, "ההקלטה השתנתה מאז שנפתחה. רעננו את הדף והאזינו שוב.");
    }
    return repo.updateRecording(id, {
      status: "approved",
      reviewNote: undefined,
    });
  }
  return repo.updateRecording(id, {
    status: "private",
    submittedAt: undefined,
    reviewNote: review.note,
  });
}
