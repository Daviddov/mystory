"use client";

import { AlertTriangle, Check, CloudUpload, Pencil } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { translateServerMessage } from "@/lib/i18n/server-errors";
import { STUDIO_SAVE_MESSAGES } from "@/lib/i18n/studio-editor";
import type { SaveState } from "./useAutosave";

export interface SaveIndicatorProps {
  state: SaveState;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

/** Always-visible save state of the editor. */
export function SaveIndicator({ state, error, onRetry, className }: SaveIndicatorProps) {
  const locale = useLocale();
  const LABELS = STUDIO_SAVE_MESSAGES[locale];
  const Icon = state === "saved" ? Check : state === "saving" ? CloudUpload : state === "error" ? AlertTriangle : Pencil;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium",
        state === "saved" && "bg-success-soft",
        state === "saving" && "bg-secondary-soft",
        state === "dirty" && "bg-surface-2",
        state === "error" && "bg-danger-soft",
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", state === "saving" && "animate-pulse")} />
      <span>{state === "error" && error ? `${LABELS.error}: ${translateServerMessage(locale, error)}` : LABELS[state]}</span>
      {state === "error" && onRetry ? (
        <button type="button" onClick={onRetry} className="rounded-full px-2 font-bold underline">
          {LABELS.retry}
        </button>
      ) : null}
    </div>
  );
}
