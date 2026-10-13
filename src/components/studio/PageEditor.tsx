"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  ImagePlus,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { MockNotice } from "@/components/MockNotice";
import { Button, Card, Field, Spinner, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { countWords } from "@/lib/hebrew";
import { mediaUrl } from "@/lib/media/url";
import { AUDIO_ACCEPT, IMAGE_ACCEPT, MAX_PAGE_TEXT, narrationStale, nikudWordMismatch } from "@/lib/studio/shared";
import { getAgeGroup } from "@/lib/taxonomy";
import type { AgeGroup } from "@/lib/types";
import { AudioRecorder } from "./AudioRecorder";
import type { EditorPage } from "./types";

/** Vocalization marks for manual correction (most phone and laptop keyboards make them hard to type). */
const NIKUD_MARKS: { mark: string; name: string }[] = [
  { mark: "ָ", name: "קמץ" },
  { mark: "ַ", name: "פתח" },
  { mark: "ֵ", name: "צירה" },
  { mark: "ֶ", name: "סגול" },
  { mark: "ִ", name: "חיריק" },
  { mark: "ֹ", name: "חולם" },
  { mark: "ֻ", name: "קובוץ" },
  { mark: "ְ", name: "שווא" },
  { mark: "ּ", name: "דגש או שורוק" },
  { mark: "ׁ", name: "שין ימנית" },
  { mark: "ׂ", name: "שין שמאלית" },
  { mark: "ֲ", name: "חטף פתח" },
  { mark: "ֱ", name: "חטף סגול" },
  { mark: "ֳ", name: "חטף קמץ" },
];

const AUDIO_SOURCE_LABELS = { tts: "הקראה אוטומטית", recorded: "הקלטה שלכם", mock: "קול הדגמה" } as const;

export interface PageEditorProps {
  page: EditorPage;
  index: number;
  total: number;
  ageGroup: AgeGroup;
  /** Cache-busting version for media URLs. */
  version?: string;
  onChange: (patch: Partial<EditorPage>) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onImageFile: (file: File) => void;
  onAudioBlob: (audio: Blob, fileName: string) => Promise<void>;
  onAutoNikud: () => void;
  onAutoNarrate: () => void;
}

/** Everything about one page: picture, text, vocalized text and narration. */
export function PageEditor({
  page,
  index,
  total,
  ageGroup,
  version,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onImageFile,
  onAudioBlob,
  onAutoNikud,
  onAutoNarrate,
}: PageEditorProps) {
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const nikudArea = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNikud, setShowNikud] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);

  const image = page.preview ?? mediaUrl(page.image, version);
  const audio = mediaUrl(page.audio, version);
  const words = countWords(page.text);
  const suggestedWords = getAgeGroup(ageGroup)?.wordsPerPage;
  const nikudOpen = showNikud || !!page.textNikud;
  const mismatch = nikudWordMismatch(page);
  const stale = narrationStale(page);
  const idBase = `page-${page.key}`;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    // Several files, or no picture: let the page-level drop zone create pages instead.
    if (!file || event.dataTransfer.files.length !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    onImageFile(file);
  };

  const insertMark = (mark: string) => {
    const area = nikudArea.current;
    const value = page.textNikud ?? "";
    const position = area ? area.selectionEnd : value.length;
    onChange({ textNikud: value.slice(0, position) + mark + value.slice(position) });
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(position + mark.length, position + mark.length);
    });
  };

  const saveAudio = async (blob: Blob, fileName: string) => {
    setAudioBusy(true);
    try {
      await onAudioBlob(blob, fileName);
    } finally {
      setAudioBusy(false);
    }
  };

  return (
    <Card as="section" aria-label={`עריכת עמוד ${index + 1}`} className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-2xl font-bold">
          עמוד {index + 1} <span className="text-base font-normal text-muted">מתוך {total}</span>
        </h2>
        <Button variant="ghost" size="icon" aria-label="הזזת העמוד אחורה" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="הזזת העמוד קדימה"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy aria-hidden="true" className="size-4" />
          שכפול
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="text-danger">
          <Trash2 aria-hidden="true" className="size-4" />
          מחיקה
        </Button>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Picture */}
        <div className="flex flex-col gap-2">
          <div
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setDragOver(true);
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-surface-2",
              dragOver ? "border-primary" : "border-border-strong",
            )}
          >
            {image ? (
              <img src={image} alt={`האיור של עמוד ${index + 1}`} className="size-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 p-4 text-center text-muted">
                <ImagePlus aria-hidden="true" className="size-10" />
                <p>גררו לכאן תמונה, או בחרו קובץ</p>
              </div>
            )}
            {page.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-overlay">
                <Spinner label="מעלה תמונה…" />
              </div>
            ) : null}
          </div>
          {page.uploadError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {page.uploadError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => imageInput.current?.click()} disabled={page.uploading}>
              <Upload aria-hidden="true" className="size-4" />
              {image ? "החלפת התמונה" : "בחירת תמונה"}
            </Button>
            {image && !page.uploading ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ image: undefined, preview: undefined, uploadError: undefined })}
              >
                הסרת התמונה
              </Button>
            ) : null}
            <input
              ref={imageInput}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImageFile(file);
              }}
            />
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col gap-4">
          <Field
            label="הטקסט של העמוד"
            htmlFor={`${idBase}-text`}
            hint={
              suggestedWords
                ? `${words} מילים. לגיל הזה מומלץ בערך ${suggestedWords} מילים בעמוד.`
                : `${words} מילים`
            }
          >
            <Textarea
              id={`${idBase}-text`}
              dir="rtl"
              rows={6}
              maxLength={MAX_PAGE_TEXT}
              value={page.text}
              onChange={(event) => onChange({ text: event.target.value })}
              placeholder="מה קורה בעמוד הזה?"
              className="font-story text-xl leading-loose"
              aria-describedby={`${idBase}-text-hint`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onAutoNikud} disabled={page.text.trim().length === 0}>
              <Wand2 aria-hidden="true" className="size-4" />
              ניקוד אוטומטי
            </Button>
            {!nikudOpen ? (
              <Button variant="ghost" size="sm" onClick={() => setShowNikud(true)}>
                ניקוד ידני
              </Button>
            ) : null}
          </div>

          {nikudOpen ? (
            <Field
              label="הטקסט המנוקד"
              htmlFor={`${idBase}-nikud`}
              hint="זה הטקסט שיוצג כשהקורא מפעיל ניקוד. אפשר לתקן אותו כאן."
              error={mismatch ? "מספר המילים כאן שונה מהטקסט הרגיל, ולכן הדגשת המילים בזמן ההקראה לא תתאים." : undefined}
            >
              <Textarea
                id={`${idBase}-nikud`}
                ref={nikudArea}
                dir="rtl"
                rows={6}
                maxLength={MAX_PAGE_TEXT * 3}
                value={page.textNikud ?? ""}
                onChange={(event) => onChange({ textNikud: event.target.value })}
                aria-invalid={mismatch || undefined}
                className="font-story text-2xl leading-loose"
              />
              <div role="group" aria-label="הוספת סימן ניקוד במקום הסמן" className="flex flex-wrap gap-1">
                {NIKUD_MARKS.map(({ mark, name }) => (
                  <button
                    key={mark}
                    type="button"
                    title={name}
                    aria-label={name}
                    onClick={() => insertMark(mark)}
                    className="flex size-10 items-center justify-center rounded-sm border border-border bg-surface font-story text-2xl hover:bg-surface-2"
                  >
                    <span aria-hidden="true">{`◌${mark}`}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {!page.textNikud ? (
                  <Button variant="ghost" size="sm" onClick={() => onChange({ textNikud: page.text })}>
                    העתקת הטקסט הרגיל לכאן
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onChange({ textNikud: undefined });
                      setShowNikud(false);
                    }}
                  >
                    מחיקת הניקוד
                  </Button>
                )}
              </div>
            </Field>
          ) : null}
        </div>
      </div>

      {/* Narration */}
      <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Volume2 aria-hidden="true" className="size-5" />
          הקראה
          {page.audio && page.audioSource ? (
            <span className="rounded-full bg-surface px-3 py-0.5 text-sm font-medium">
              {AUDIO_SOURCE_LABELS[page.audioSource]}
            </span>
          ) : null}
        </h3>
        {audio ? (
          <audio key={audio} controls preload="none" src={audio} className="w-full max-w-xl" />
        ) : (
          <p className="text-muted">לעמוד הזה אין הקראה עדיין.</p>
        )}
        {page.audio && page.audioSource === "mock" ? <MockNotice kind="tts" /> : null}
        {stale ? (
          <p role="alert" className="font-medium text-warning">
            הטקסט השתנה אחרי ההקראה, ולכן ההקראה כבר לא תואמת. כדאי להקריא מחדש.
          </p>
        ) : null}
        {page.audio && page.audioSource === "recorded" ? (
          <p className="text-sm text-muted">אם שיניתם את הטקסט אחרי ההקלטה, כדאי להקליט שוב.</p>
        ) : null}
        <div className="flex flex-wrap items-start gap-2">
          <Button variant="secondary" onClick={onAutoNarrate} disabled={page.text.trim().length === 0 || audioBusy}>
            <Sparkles aria-hidden="true" className="size-5" />
            הקראה אוטומטית
          </Button>
          <AudioRecorder
            key={page.key}
            disabled={audioBusy}
            onRecorded={(recording) => void saveAudio(recording, "recording")}
          />
          <Button variant="outline" onClick={() => audioInput.current?.click()} loading={audioBusy}>
            <Upload aria-hidden="true" className="size-5" />
            העלאת קובץ שמע
          </Button>
          {page.audio ? (
            <Button
              variant="ghost"
              onClick={() => onChange({ audio: undefined, audioSource: undefined, wordTimings: undefined })}
            >
              הסרת ההקראה
            </Button>
          ) : null}
          <input
            ref={audioInput}
            type="file"
            accept={AUDIO_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void saveAudio(file, file.name);
            }}
          />
        </div>
      </div>
    </Card>
  );
}
