"use client";

import { Clapperboard, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media/url";
import { createBookVideo, VideoCancelledError, videoSupported, type VideoPage } from "./book-video";

export interface BookVideoButtonProps {
  title: string;
  slug: string;
  coverImage?: string;
  /** Cache-busting version for media URLs (book.updatedAt). */
  version?: string;
  pages: Array<{ text: string; textNikud?: string; image?: string; audio?: string; audioSource?: string }>;
  className?: string;
}

type Status = "checking" | "unsupported" | "idle" | "working" | "error";

/**
 * "Make a video": records the book in the browser as one video file (each
 * illustration with its narration and subtitles). Nothing is uploaded, and it
 * takes as long as the narration, because the browser records in real time.
 */
export function BookVideoButton({ title, slug, coverImage, version, pages, className }: BookVideoButtonProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [step, setStep] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setStatus(videoSupported() ? "idle" : "unsupported");
    return () => abortRef.current?.abort();
  }, []);

  async function start() {
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setStep({ done: 0, total: pages.length });
    setStatus("working");
    const videoPages: VideoPage[] = pages.map((page) => ({
      text: page.textNikud || page.text,
      image: page.image ? mediaUrl(page.image, version) : undefined,
      audio: page.audio && page.audioSource !== "mock" ? mediaUrl(page.audio, version) : undefined,
    }));
    try {
      const result = await createBookVideo({
        title,
        cover: coverImage ? mediaUrl(coverImage, version) : undefined,
        pages: videoPages,
        signal: controller.signal,
        onProgress: (done, total) => setStep({ done, total }),
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}.${result.extension}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("idle");
    } catch (err) {
      if (err instanceof VideoCancelledError || controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      setError("יצירת הסרטון לא הצליחה. נסו שוב, עדיף בדפדפן Chrome.");
      setStatus("error");
    }
  }

  // Browsers that cannot record a canvas (older Safari, in-app browsers): show nothing.
  if (status === "unsupported") return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          loading={status === "working"}
          disabled={status === "checking"}
          onClick={start}
          aria-label={`יצירת סרטון מהספר: ${title}`}
        >
          {status === "working" ? null : <Clapperboard aria-hidden="true" className="size-5" />}
          {status === "working" ? `יוצר סרטון… עמוד ${Math.min(step.done + 1, step.total)} מתוך ${step.total}` : "יצירת סרטון"}
        </Button>
        {status === "working" ? (
          <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
            <X aria-hidden="true" className="size-4" />
            ביטול
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="max-w-sm text-sm">
        {status === "working" ? "הסרטון נוצר בזמן אמת, בגודל ההקראה. כדאי להשאיר את הלשונית פתוחה." : null}
        {status === "error" ? <span className="text-danger">{error}</span> : null}
      </p>
    </div>
  );
}
