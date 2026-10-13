"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Volume2 } from "lucide-react";
import { useId } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";
import type { EditorPage } from "./types";

export interface PageListProps {
  pages: EditorPage[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Called with the dragged page key and the key of the page it was dropped on. */
  onReorder: (fromKey: string, toKey: string) => void;
  /** Cache-busting version for media URLs. */
  version?: string;
  disabled?: boolean;
}

/** Page thumbnails with drag-to-reorder (pointer, touch and keyboard). */
export function PageList({ pages, selectedKey, onSelect, onReorder, version, disabled }: PageListProps) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((page) => page.key)} strategy={rectSortingStrategy} disabled={disabled}>
        <ol
          aria-label="עמודי הספר"
          className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[70dvh] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:pe-1"
        >
          {pages.map((page, index) => (
            <PageListItem
              key={page.key}
              page={page}
              index={index}
              selected={page.key === selectedKey}
              onSelect={onSelect}
              version={version}
              disabled={disabled}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

interface PageListItemProps {
  page: EditorPage;
  index: number;
  selected: boolean;
  onSelect: (key: string) => void;
  version?: string;
  disabled?: boolean;
}

function PageListItem({ page, index, selected, onSelect, version, disabled }: PageListItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: page.key,
  });
  const image = page.preview ?? mediaUrl(page.image, version);
  const snippet = page.text.trim();

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex w-36 shrink-0 items-stretch rounded-md border-2 bg-surface lg:w-auto",
        selected ? "border-primary" : "border-border",
        isDragging && "z-10 opacity-80 shadow-pop",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`גרירת עמוד ${index + 1} לשינוי הסדר`}
        className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-s-sm text-muted hover:bg-surface-2 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => onSelect(page.key)}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1 p-1.5 text-start lg:flex-row lg:items-center lg:gap-2"
      >
        <span className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden rounded-sm bg-surface-2 lg:w-20">
          {image ? (
            <img src={image} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className="flex size-full items-center justify-center text-2xl" aria-hidden="true">
              🖼️
            </span>
          )}
          {page.uploading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-overlay">
              <Spinner size="sm" label="מעלה תמונה" />
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1 text-sm font-bold">
            עמוד {index + 1}
            {page.audio ? <Volume2 aria-label="יש הקראה" className="size-4 text-secondary" /> : null}
            {page.uploadError ? <AlertTriangle aria-label="העלאת התמונה נכשלה" className="size-4 text-danger" /> : null}
          </span>
          <span className="line-clamp-1 text-xs text-muted lg:line-clamp-2">{snippet || "בלי טקסט"}</span>
        </span>
      </button>
    </li>
  );
}
