"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  /** Called when the user presses Escape, clicks the backdrop or the close button. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, rendered in a row at the bottom. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Set false to force a choice (no backdrop click, no close button). Default true. */
  dismissible?: boolean;
  className?: string;
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" };

/** Modal dialog built on the native <dialog> element (focus trap and Escape come from the browser). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-border bg-surface p-0 text-foreground shadow-pop",
        "backdrop:bg-overlay",
        SIZES[size],
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start gap-3 p-5 pb-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-2xl font-bold leading-snug">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="סגירה"
                className="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface-2"
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </header>
          {children ? <div className="overflow-y-auto px-5 pb-5">{children}</div> : null}
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-3 border-t border-border p-4">{footer}</footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
