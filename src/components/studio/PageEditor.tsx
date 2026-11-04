"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  ImagePlus,
  Paintbrush,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { MockNotice } from "@/components/MockNotice";
import { Button, Card, Field, Input, Spinner, Textarea } from "@/components/ui";
import { PAGE_EDITOR_MESSAGES } from "@/lib/i18n/studio-panels";
import { cn } from "@/lib/cn";
import { countWords } from "@/lib/hebrew";
import { mediaUrl } from "@/lib/media/url";
import {
  AUDIO_ACCEPT,
  IMAGE_ACCEPT,
  MAX_ILLUSTRATION_NOTE,
  MAX_PAGE_TEXT,
  narrationStale,
  nikudWordMismatch,
} from "@/lib/studio/shared";
import { getAgeGroup } from "@/lib/taxonomy";
import type { AgeGroup, BookLanguage } from "@/lib/types";
import { AudioRecorder } from "./AudioRecorder";
import type { EditorPage } from "./types";

/** Vocalization marks for manual correction (most phone and laptop keyboards make them hard to type). */
const NIKUD_MARKS: { mark: string; name: keyof (typeof PAGE_EDITOR_MESSAGES)["he"]["nikudMarks"] }[] = [
  { mark: "ָ", name: "qamats" },
  { mark: "ַ", name: "patah" },
  { mark: "ֵ", name: "tsere" },
  { mark: "ֶ", name: "segol" },
  { mark: "ִ", name: "hiriq" },
  { mark: "ֹ", name: "holam" },
  { mark: "ֻ", name: "qubuts" },
  { mark: "ְ", name: "sheva" },
  { mark: "ּ", name: "dagesh" },
  { mark: "ׁ", name: "shinDot" },
  { mark: "ׂ", name: "sinDot" },
  { mark: "ֲ", name: "hatafPatah" },
  { mark: "ֱ", name: "hatafSegol" },
  { mark: "ֳ", name: "hatafQamats" },
];

export interface PageEditorProps {
  page: EditorPage;
  index: number;
  total: number;
  ageGroup: AgeGroup;
  /** Language of the book's text: sets the direction of the text boxes (not the interface's). */
  language?: BookLanguage;
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
  /** True when the book has a hero to draw the page from. */
  hasHero: boolean;
  /** Draws the page from the hero, the story and the page; `note` is optional art direction. */
  onIllustrate: (note: string) => void;
}

/** Everything about one page: picture, text, vocalized text and narration. */
export function PageEditor({
  page,
  index,
  total,
  ageGroup,
  language = "he",
  version,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onImageFile,
  onAudioBlob,
  onAutoNikud,
  onAutoNarrate,
  hasHero,
  onIllustrate,
}: PageEditorProps) {
  const locale = useLocale();
  const t = PAGE_EDITOR_MESSAGES[locale];
  const textDir = language === "en" ? "ltr" : "rtl";
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const nikudArea = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNikud, setShowNikud] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [illustrationNote, setIllustrationNote] = useState("");

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
    <Card as="section" aria-label={t.editPage(index + 1)} className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-2xl font-bold">
          {t.page(index + 1)} <span className="text-base font-normal text-muted">{t.of(total)}</span>
        </h2>
        <Button variant="ghost" size="icon" aria-label={t.moveBack} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.moveForward}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy aria-hidden="true" className="size-4" />
          {t.duplicate}
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="text-danger">
          <Trash2 aria-hidden="true" className="size-4" />
          {t.delete}
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
              <img src={image} alt={t.pictureAlt(index + 1)} className="size-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 p-4 text-center text-muted">
                <ImagePlus aria-hidden="true" className="size-10" />
                <p>{t.dropPicture}</p>
              </div>
            )}
            {page.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-overlay">
                <Spinner label={t.uploadingPicture} />
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
              {image ? t.replacePicture : t.choosePicture}
            </Button>
            {image && !page.uploading ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ image: undefined, preview: undefined, uploadError: undefined })}
              >
                {t.removePicture}
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
          <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3">
            <Field
              label={t.illustrateLabel}
              htmlFor={`${idBase}-art-note`}
              hint={hasHero ? t.illustrateHint : t.illustrateNeedsHero}
            >
              <Input
                id={`${idBase}-art-note`}
                maxLength={MAX_ILLUSTRATION_NOTE}
                value={illustrationNote}
                onChange={(event) => setIllustrationNote(event.target.value)}
                dir="auto"
                placeholder={t.illustratePlaceholder}
                disabled={!hasHero}
              />
            </Field>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onIllustrate(illustrationNote)}
                disabled={!hasHero || page.text.trim().length === 0 || page.uploading}
              >
                <Paintbrush aria-hidden="true" className="size-4" />
                {image ? t.illustrateAgain : t.illustrate}
              </Button>
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col gap-4">
          <Field
            label={t.pageText}
            htmlFor={`${idBase}-text`}
            hint={suggestedWords ? t.wordsSuggested(words, suggestedWords) : t.words(words)}
          >
            <Textarea
              id={`${idBase}-text`}
              dir={textDir}
              rows={6}
              maxLength={MAX_PAGE_TEXT}
              value={page.text}
              onChange={(event) => onChange({ text: event.target.value })}
              placeholder={t.textPlaceholder}
              className="font-story text-xl leading-loose"
              aria-describedby={`${idBase}-text-hint`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onAutoNikud} disabled={page.text.trim().length === 0}>
              <Wand2 aria-hidden="true" className="size-4" />
              {t.autoNikud}
            </Button>
            {!nikudOpen ? (
              <Button variant="ghost" size="sm" onClick={() => setShowNikud(true)}>
                {t.manualNikud}
              </Button>
            ) : null}
          </div>

          {nikudOpen ? (
            <Field
              label={t.nikudText}
              htmlFor={`${idBase}-nikud`}
              hint={t.nikudHint}
              error={mismatch ? t.nikudMismatch : undefined}
            >
              <Textarea
                id={`${idBase}-nikud`}
                ref={nikudArea}
                dir={textDir}
                rows={6}
                maxLength={MAX_PAGE_TEXT * 3}
                value={page.textNikud ?? ""}
                onChange={(event) => onChange({ textNikud: event.target.value })}
                aria-invalid={mismatch || undefined}
                className="font-story text-2xl leading-loose"
              />
              <div role="group" aria-label={t.insertMark} className="flex flex-wrap gap-1">
                {NIKUD_MARKS.map(({ mark, name }) => (
                  <button
                    key={mark}
                    type="button"
                    title={t.nikudMarks[name]}
                    aria-label={t.nikudMarks[name]}
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
                    {t.copyPlain}
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
                    {t.deleteNikud}
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
          {t.narration}
          {page.audio && page.audioSource ? (
            <span className="rounded-full bg-surface px-3 py-0.5 text-sm font-medium">
              {t.audioSource[page.audioSource]}
            </span>
          ) : null}
        </h3>
        {audio ? (
          <audio key={audio} controls preload="none" src={audio} className="w-full max-w-xl" />
        ) : (
          <p className="text-muted">{t.noNarration}</p>
        )}
        {page.audio && page.audioSource === "mock" ? <MockNotice kind="tts" /> : null}
        {stale ? (
          <p role="alert" className="font-medium text-warning">
            {t.narrationStale}
          </p>
        ) : null}
        {page.audio && page.audioSource === "recorded" ? (
          <p className="text-sm text-muted">{t.recordedNote}</p>
        ) : null}
        <div className="flex flex-wrap items-start gap-2">
          <Button variant="secondary" onClick={onAutoNarrate} disabled={page.text.trim().length === 0 || audioBusy}>
            <Sparkles aria-hidden="true" className="size-5" />
            {t.autoNarrate}
          </Button>
          <AudioRecorder
            key={page.key}
            disabled={audioBusy}
            onRecorded={(recording) => void saveAudio(recording, "recording")}
          />
          <Button variant="outline" onClick={() => audioInput.current?.click()} loading={audioBusy}>
            <Upload aria-hidden="true" className="size-5" />
            {t.uploadAudio}
          </Button>
          {page.audio ? (
            <Button
              variant="ghost"
              onClick={() => onChange({ audio: undefined, audioSource: undefined, wordTimings: undefined })}
            >
              {t.removeNarration}
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
