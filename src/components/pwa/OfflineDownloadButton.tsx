"use client";

import { CheckCircle2, CloudDownload, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, type ButtonSize } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  OFFLINE_EVENT,
  OfflineDownloadError,
  downloadBook,
  getDownload,
  offlineReadPath,
  offlineReady,
  offlineSupported,
  removeDownload,
  type DownloadProgress,
} from "./offline-store";

export interface OfflineDownloadButtonProps {
  bookId: string;
  title?: string;
  /** Share token, when the book is private and was opened through a share link. */
  token?: string;
  size?: ButtonSize;
  className?: string;
}

type Status = "checking" | "unsupported" | "absent" | "downloading" | "saved" | "error";

/**
 * "Download for offline": stores the pages, illustrations and narration of one
 * book on the device. It reports success only when every file was stored.
 */
export function OfflineDownloadButton({ bookId, title, token, size = "md", className }: OfflineDownloadButtonProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [progress, setProgress] = useState<DownloadProgress>({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [ready, setReady] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!offlineSupported()) {
        setStatus("unsupported");
        return;
      }
      setReady(offlineReady());
      getDownload(bookId)
        .then((book) => {
          if (cancelled) return;
          setStatus((current) => (current === "downloading" ? current : book ? "saved" : "absent"));
        })
        .catch(() => {
          if (!cancelled) setStatus((current) => (current === "downloading" ? current : "absent"));
        });
    };
    check();
    const onController = () => setReady(offlineReady());
    window.addEventListener(OFFLINE_EVENT, check);
    navigator.serviceWorker?.addEventListener("controllerchange", onController);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_EVENT, check);
      navigator.serviceWorker?.removeEventListener("controllerchange", onController);
      abortRef.current?.abort();
    };
  }, [bookId]);

  async function start() {
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setProgress({ done: 0, total: 0 });
    setStatus("downloading");
    try {
      await downloadBook(bookId, { token, signal: controller.signal, onProgress: setProgress });
      setReady(offlineReady());
      setStatus("saved");
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("absent");
        return;
      }
      setError(err instanceof OfflineDownloadError ? err.message : "ההורדה לא הצליחה. נסו שוב.");
      setStatus("error");
    }
  }

  async function remove() {
    await removeDownload(bookId).catch(() => undefined);
    setStatus("absent");
  }

  // Browsers without Cache Storage (or an insecure address) cannot keep books: show nothing.
  if (status === "unsupported") return null;

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (status === "saved") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-success-soft px-4 text-sm font-semibold">
            <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
            שמור במכשיר
          </span>
          {/* A full page load on purpose: the offline reader must work without the network. */}
          <a href={offlineReadPath(bookId)} className="text-sm font-semibold underline">
            פתיחה בלי רשת
          </a>
          <Button variant="ghost" size="sm" onClick={remove} aria-label={title ? `הסרת ההורדה של ${title}` : "הסרת ההורדה"}>
            <Trash2 aria-hidden="true" className="size-4" />
            הסרה
          </Button>
        </div>
        {ready ? null : (
          <p role="note" className="max-w-sm text-sm text-warning">
            הספר נשמר, אבל הקריאה בלי רשת עדיין לא פעילה בדפדפן הזה. טענו את העמוד מחדש; אם ההודעה נשארת, הדפדפן
            או כתובת האתר לא תומכים בכך.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div>
        <Button
          variant="outline"
          size={size}
          loading={status === "downloading"}
          disabled={status === "checking"}
          onClick={start}
          aria-label={`הורדה לקריאה בלי רשת${title ? `: ${title}` : ""}`}
        >
          {status === "downloading" ? null : <CloudDownload aria-hidden="true" className="size-5" />}
          {status === "downloading" ? `מוריד… ${percent}%` : "הורדה לקריאה בלי רשת"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-sm">
        {status === "error" ? <span className="text-danger">{error}</span> : null}
      </p>
    </div>
  );
}
