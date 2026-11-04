"use client";

import { CheckCircle2, CloudDownload, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, type ButtonSize } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountMessages, type AccountMessages } from "@/lib/i18n/account";
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

function downloadErrorText(err: unknown, t: AccountMessages["download"]): string {
  if (!(err instanceof OfflineDownloadError)) return t.failed;
  switch (err.kind) {
    case "unsupported":
      return t.errors.unsupported;
    case "manifest":
      return t.errors.manifest;
    case "assets":
      return t.errors.assets(err.failed.length);
    case "storage":
      return t.errors.storage;
    default:
      return err.message;
  }
}

/**
 * "Download for offline": stores the pages, illustrations and narration of one
 * book on the device. It reports success only when every file was stored.
 */
export function OfflineDownloadButton({ bookId, title, token, size = "md", className }: OfflineDownloadButtonProps) {
  const t = accountMessages(useLocale()).download;
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
      setError(downloadErrorText(err, t));
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
            {t.saved}
          </span>
          {/* A full page load on purpose: the offline reader must work without the network. */}
          <a href={offlineReadPath(bookId)} className="text-sm font-semibold underline">
            {t.openOffline}
          </a>
          <Button variant="ghost" size="sm" onClick={remove} aria-label={t.removeAria(title)}>
            <Trash2 aria-hidden="true" className="size-4" />
            {t.remove}
          </Button>
        </div>
        {ready ? null : (
          <p role="note" className="max-w-sm text-sm text-warning">
            {t.notActive}
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
          aria-label={t.downloadAria(title)}
        >
          {status === "downloading" ? null : <CloudDownload aria-hidden="true" className="size-5" />}
          {status === "downloading" ? t.downloading(percent) : t.download}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-sm">
        {status === "error" ? <span className="text-danger">{error}</span> : null}
      </p>
    </div>
  );
}
