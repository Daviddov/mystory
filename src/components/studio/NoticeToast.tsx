"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { MockNotice } from "@/components/MockNotice";
import { cn } from "@/lib/cn";
import type { EditorNotice } from "./types";

/** A success message goes away by itself after this long; errors and info stay until closed. */
export const SUCCESS_DISMISS_MS = 8000;

/**
 * The result of an action, fixed to the bottom of the screen so it is seen
 * wherever the user has scrolled. Success fades after a few seconds, errors persist.
 */
export function NoticeToast({ notice, onClose }: { notice: EditorNotice; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (notice.tone !== "success") return;
    const timer = window.setTimeout(() => close.current(), SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div
        role={notice.tone === "error" ? "alert" : "status"}
        data-testid="notice-toast"
        className={cn(
          "pointer-events-auto flex w-full max-w-xl flex-col gap-2 rounded-lg border border-border p-4 shadow-pop",
          notice.tone === "error" && "bg-danger-soft",
          notice.tone === "success" && "bg-success-soft",
          notice.tone === "info" && "bg-secondary-soft",
        )}
      >
        <div className="flex items-start gap-3">
          <p className="flex-1 font-medium">{notice.text}</p>
          <button
            type="button"
            aria-label="סגירת ההודעה"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-surface"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {notice.mock ? <MockNotice kind={notice.mock} /> : null}
      </div>
    </div>
  );
}
