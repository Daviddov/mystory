"use client";

import { AudioLines } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { READER_MESSAGES, type ReaderMessages } from "@/lib/i18n/reader";
import type { RecordingView } from "@/lib/recordings/client";

export interface VoicePickerProps {
  /** The book has its own narration ("הקראה מקורית"). */
  hasOriginal: boolean;
  versions: RecordingView[];
  /** Selected recording id, or null for the book's own narration. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Direction of the interface, when the picker sits inside a part laid out in the book's direction. */
  dir?: "rtl" | "ltr";
}

const ORIGINAL = "original";

function versionLabel(version: RecordingView, t: ReaderMessages["voice"]): string {
  if (!version.mine) return version.title;
  if (version.status === "approved") return t.mineShared(version.title);
  if (version.status === "pending") return t.minePending(version.title);
  return t.mine(version.title);
}

/** Which voice reads the story: the book's narration or a family recording. */
export function VoicePicker({ hasOriginal, versions, value, onChange, dir }: VoicePickerProps) {
  const t = READER_MESSAGES[useLocale()].voice;
  const count = versions.length + (hasOriginal ? 1 : 0);
  if (count < 2) return null;
  return (
    <label
      dir={dir}
      className="inline-flex min-h-touch min-w-0 items-center gap-1.5 rounded-full bg-surface-2 ps-3 pe-1 text-sm font-semibold"
    >
      <AudioLines aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{t.who}</span>
      <select
        value={value ?? ORIGINAL}
        onChange={(event) => onChange(event.target.value === ORIGINAL ? null : event.target.value)}
        className="min-w-0 max-w-44 cursor-pointer truncate rounded-full bg-transparent py-2 pe-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {hasOriginal ? <option value={ORIGINAL}>{t.original}</option> : null}
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {versionLabel(version, t)}
          </option>
        ))}
      </select>
    </label>
  );
}
