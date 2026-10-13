"use client";

import { FolderOpen, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { filesFromDrop, filesFromInput, type PickedFile } from "@/lib/importers/client-files";

export interface DropZoneProps {
  onFiles: (files: PickedFile[]) => void;
  disabled?: boolean;
  /** Shorter layout, used once pages were already added. */
  compact?: boolean;
  className?: string;
}

const ACCEPT = ".zip,.pdf,image/png,image/jpeg,image/webp,image/gif,image/avif";

/** Drop target for a zip package, a PDF, images or a whole folder, with buttons for keyboard and touch users. */
export function DropZone({ onFiles, disabled, compact, className }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    onFiles(await filesFromDrop(event.dataTransfer));
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border-2 border-dashed text-center transition-colors",
        compact ? "p-5" : "p-8 sm:p-12",
        over ? "border-primary bg-primary-soft" : "border-border-strong bg-surface",
        disabled && "opacity-60",
        className,
      )}
    >
      {compact ? null : <Upload aria-hidden="true" className="size-12 text-primary" />}
      <div className="flex flex-col gap-1">
        <p className={cn("font-bold", compact ? "text-lg" : "text-2xl")}>
          {compact ? "גררו לכאן עוד תמונות" : "גררו לכאן קבצים או תיקייה"}
        </p>
        {compact ? null : (
          <p className="text-muted">קובץ zip של ספר, קובץ PDF, או תמונות (כל תמונה תהפוך לעמוד)</p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" disabled={disabled} onClick={() => filesInput.current?.click()}>
          <Upload aria-hidden="true" className="size-5" />
          בחירת קבצים
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => folderInput.current?.click()}>
          <FolderOpen aria-hidden="true" className="size-5" />
          בחירת תיקייה
        </Button>
      </div>
      <input
        ref={filesInput}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(filesFromInput(event.target.files));
          event.target.value = "";
        }}
      />
      <input
        ref={(element) => {
          folderInput.current = element;
          // Not a typed React attribute; lets the picker choose a whole folder.
          element?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(filesFromInput(event.target.files));
          event.target.value = "";
        }}
      />
    </div>
  );
}
