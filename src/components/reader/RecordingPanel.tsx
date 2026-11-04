"use client";

import { Check, Pencil, Plus, Send, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { AudioRecorder } from "@/components/studio/AudioRecorder";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Spinner } from "@/components/ui";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import {
  createRecordingRequest,
  deletePageRequest,
  renameRecordingRequest,
  savePageRequest,
  shareRecordingRequest,
  type RecordingResult,
  type RecordingView,
} from "@/lib/recordings/client";

export interface RecordingPanelProps {
  bookId: string;
  /** Share token of a private book opened by link. */
  shareToken?: string;
  /** Sharing is offered for published books only. */
  canShare: boolean;
  pageIndex: number;
  pageCount: number;
  /** The own recording being made, or null before the first take. */
  recording: RecordingView | null;
  onChange: (recording: RecordingView) => void;
  /** Start a fresh recording (the next take creates it). */
  onStartNew: () => void;
  /** Called after a take was saved, to move on to the next page. */
  onSaved: () => void;
  onClose: () => void;
}

/**
 * Recording mode of the reader: the family reads the book aloud page by page.
 * Each take is saved right away to the reader's own recording ("המדף שלי").
 */
export function RecordingPanel({
  bookId,
  shareToken,
  canShare,
  pageIndex,
  pageCount,
  recording,
  onChange,
  onStartNew,
  onSaved,
  onClose,
}: RecordingPanelProps) {
  const t = READER_MESSAGES[useLocale()].recording;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const take = recording?.pages.find((page) => page.index === pageIndex);
  const recordedCount = recording?.pages.length ?? 0;

  async function run(action: () => Promise<RecordingResult>, done?: (view: RecordingView) => void) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.recording);
    done?.(result.recording);
  }

  async function saveTake(blob: Blob) {
    await run(
      async () => {
        let target = recording;
        if (!target) {
          const created = await createRecordingRequest(bookId, undefined, shareToken);
          if (!created.ok) return created;
          target = created.recording;
          onChange(target);
        }
        return savePageRequest(target.id, pageIndex, blob);
      },
      () => {
        if (pageIndex < pageCount - 1) onSaved();
        else setMessage(t.allDone);
      },
    );
  }

  return (
    <section
      aria-label={t.region}
      className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {renaming && recording ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setRenaming(false);
              void run(() => renameRecordingRequest(recording.id, draftTitle));
            }}
          >
            <input
              autoFocus
              aria-label={t.name}
              maxLength={60}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="min-h-10 w-48 rounded-md border border-border-strong bg-background px-3"
            />
            <Button type="submit" size="icon" variant="ghost" aria-label={t.saveName}>
              <Check aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-1 font-bold">
            <span aria-hidden="true">🎙️</span>
            {recording ? <bdi>{recording.title}</bdi> : t.newRecording}
            {recording ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={t.rename}
                onClick={() => {
                  setDraftTitle(recording.title);
                  setRenaming(true);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </p>
        )}
        <p className="text-sm text-muted">
          {t.progress(recordedCount, pageCount)}
          {recording ? ` · ${t.status[recording.status]}` : ""}
        </p>
        <div className="ms-auto flex items-center gap-1">
          {recording ? (
            <Button size="sm" variant="ghost" onClick={onStartNew} disabled={busy}>
              <Plus aria-hidden="true" className="size-4" />
              {t.newRecording}
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" aria-label={t.close} title={t.close} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AudioRecorder
          label={take ? t.recordAgain(pageIndex + 1) : t.recordPage(pageIndex + 1)}
          disabled={busy}
          onRecorded={(blob) => void saveTake(blob)}
        />
        {busy ? <Spinner size="sm" label={t.saving} /> : null}
        {take && !busy ? (
          <>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
              <Check aria-hidden="true" className="size-4" />
              {t.hasTake}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => recording && void run(() => deletePageRequest(recording.id, pageIndex))}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t.delete}
            </Button>
          </>
        ) : null}
        {recording && canShare && recordedCount > 0 ? (
          recording.status === "private" ? (
            <Button
              size="sm"
              variant="secondary"
              className="ms-auto"
              disabled={busy}
              onClick={() =>
                void run(
                  () => shareRecordingRequest(recording.id, "submit"),
                  () => setMessage(t.submitted),
                )
              }
            >
              <Send aria-hidden="true" className="size-4" />
              {t.share}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto"
              disabled={busy}
              onClick={() => void run(() => shareRecordingRequest(recording.id, "withdraw"))}
            >
              <Undo2 aria-hidden="true" className="size-4" />
              {t.unshare}
            </Button>
          )
        ) : null}
      </div>
      {recording?.reviewNote && recording.status === "private" ? (
        <p className="rounded-md bg-warning-soft px-3 py-1.5 text-sm">{t.reviewNote(recording.reviewNote)}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        {t.hint}
      </p>
    </section>
  );
}
