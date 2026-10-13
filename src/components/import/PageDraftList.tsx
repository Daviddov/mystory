"use client";

import { ArrowDown, ArrowUp, ScanText, Trash2 } from "lucide-react";
import { Button, Spinner, Textarea } from "@/components/ui";
import { IMPORT_LIMITS } from "@/lib/importers/limits";

export interface DraftPage {
  key: string;
  /** Original file name or "PDF page N"; shown as a caption. */
  name: string;
  image: Blob;
  previewUrl: string;
  text: string;
  ocr: "idle" | "busy" | "error";
  ocrMessage?: string;
}

export interface PageDraftListProps {
  pages: DraftPage[];
  disabled?: boolean;
  /** Shows the "recognise text" button on every page. */
  ocrEnabled: boolean;
  onText: (key: string, text: string) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
  onOcr: (key: string) => void;
}

/** Editable preview of the pages about to be imported: thumbnail, text, order. */
export function PageDraftList({ pages, disabled, ocrEnabled, onText, onMove, onRemove, onOcr }: PageDraftListProps) {
  return (
    <ol className="flex flex-col gap-4">
      {pages.map((page, index) => {
        const textId = `page-text-${page.key}`;
        return (
          <li
            key={page.key}
            className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:grid-cols-[12rem_1fr]"
          >
            <div className="flex flex-col gap-2">
              <img
                src={page.previewUrl}
                alt={`עמוד ${index + 1}`}
                className="aspect-[4/3] w-full rounded-sm bg-surface-2 object-contain"
              />
              <p className="truncate text-sm text-muted" dir="auto" title={page.name}>
                {page.name}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={textId} className="text-lg font-bold">
                  עמוד {index + 1}
                </label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`העברת עמוד ${index + 1} למעלה`}
                    disabled={disabled || index === 0}
                    onClick={() => onMove(page.key, -1)}
                  >
                    <ArrowUp aria-hidden="true" className="size-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`העברת עמוד ${index + 1} למטה`}
                    disabled={disabled || index === pages.length - 1}
                    onClick={() => onMove(page.key, 1)}
                  >
                    <ArrowDown aria-hidden="true" className="size-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`הסרת עמוד ${index + 1}`}
                    disabled={disabled}
                    onClick={() => onRemove(page.key)}
                  >
                    <Trash2 aria-hidden="true" className="size-5 text-danger" />
                  </Button>
                </div>
              </div>
              <Textarea
                id={textId}
                dir="auto"
                rows={4}
                value={page.text}
                disabled={disabled || page.ocr === "busy"}
                maxLength={IMPORT_LIMITS.pageTextChars}
                placeholder="הטקסט של העמוד. אפשר להשאיר ריק ולהשלים אחר כך בעורך."
                onChange={(event) => onText(page.key, event.target.value)}
              />
              {ocrEnabled ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || page.ocr === "busy"}
                    onClick={() => onOcr(page.key)}
                  >
                    <ScanText aria-hidden="true" className="size-4" />
                    זיהוי טקסט מהתמונה
                  </Button>
                  {page.ocr === "busy" ? <Spinner size="sm" label="מזהה טקסט…" /> : null}
                  {page.ocrMessage ? (
                    <p role="status" className={page.ocr === "error" ? "text-sm text-danger" : "text-sm text-muted"}>
                      {page.ocrMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
