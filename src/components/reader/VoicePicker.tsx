"use client";

import { AudioLines } from "lucide-react";
import type { RecordingView } from "@/lib/recordings/client";

export interface VoicePickerProps {
  /** The book has its own narration ("הקראה מקורית"). */
  hasOriginal: boolean;
  versions: RecordingView[];
  /** Selected recording id, or null for the book's own narration. */
  value: string | null;
  onChange: (id: string | null) => void;
}

const ORIGINAL = "original";

function versionLabel(version: RecordingView): string {
  if (!version.mine) return version.title;
  if (version.status === "approved") return `${version.title} (שלי, משותפת)`;
  if (version.status === "pending") return `${version.title} (שלי, ממתינה לאישור)`;
  return `${version.title} (שלי)`;
}

/** Which voice reads the story: the book's narration or a family recording. */
export function VoicePicker({ hasOriginal, versions, value, onChange }: VoicePickerProps) {
  const count = versions.length + (hasOriginal ? 1 : 0);
  if (count < 2) return null;
  return (
    <label className="inline-flex min-h-touch min-w-0 items-center gap-1.5 rounded-full bg-surface-2 ps-3 pe-1 text-sm font-semibold">
      <AudioLines aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">מי מקריא</span>
      <select
        value={value ?? ORIGINAL}
        onChange={(event) => onChange(event.target.value === ORIGINAL ? null : event.target.value)}
        className="min-w-0 max-w-44 cursor-pointer truncate rounded-full bg-transparent py-2 pe-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {hasOriginal ? <option value={ORIGINAL}>הקראה מקורית</option> : null}
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {versionLabel(version)}
          </option>
        ))}
      </select>
    </label>
  );
}
