"use client";

import { ArrowDown, ArrowUp, ScanText, Trash2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Spinner, Textarea } from "@/components/ui";
import { STUDIO_PAGE_DRAFTS } from "@/lib/i18n/studio-import";
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
  const t = STUDIO_PAGE_DRAFTS[useLocale()];
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
                alt={t.page(index + 1)}
                className="aspect-[4/3] w-full rounded-sm bg-surface-2 object-contain"
              />
              <p className="truncate text-sm text-muted" dir="auto" title={page.name}>
                {page.name}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={textId} className="text-lg font-bold">
                  {t.page(index + 1)}
                </label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.moveUp(index + 1)}
                    disabled={disabled || index === 0}
                    onClick={() => onMove(page.key, -1)}
                  >
                    <ArrowUp aria-hidden="true" className="size-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.moveDown(index + 1)}
                    disabled={disabled || index === pages.length - 1}
                    onClick={() => onMove(page.key, 1)}
                  >
                    <ArrowDown aria-hidden="true" className="size-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.remove(index + 1)}
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
                placeholder={t.textPlaceholder}
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
                    {t.recognise}
                  </Button>
                  {page.ocr === "busy" ? <Spinner size="sm" label={t.recognising} /> : null}
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
