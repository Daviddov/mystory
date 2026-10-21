"use client";

import { BookOpen, Headphones, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";

export interface StartScreenProps {
  title: string;
  author?: string;
  /** Personal dedication, shown under the title. */
  dedication?: string;
  /** Cover URL, already resolved through mediaUrl. */
  cover: string;
  /** Saved position to continue from (zero-based), shown on the read button. */
  resumePage: number;
  onRead: () => void;
  /** Present when the book has narration. */
  onListen?: () => void;
  /** The "download for offline" control, when the book can be downloaded. */
  download?: ReactNode;
  /** Book details page. */
  detailsHref?: string | null;
}

/** Shown when a book is opened from its cover: read, listen or download. */
export function StartScreen({
  title,
  author,
  dedication,
  cover,
  resumePage,
  onRead,
  onListen,
  download,
  detailsHref,
}: StartScreenProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-start-title"
      className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-background p-6"
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-40 blur-3xl saturate-150 bedtime:opacity-25"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background/90"
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="max-h-[40vh] w-auto max-w-[70%] -rotate-2 rounded-[1.5rem] object-contain shadow-pop ring-4 ring-surface/80 transition-transform duration-500 hover:rotate-0"
          />
        ) : (
          <p className="text-8xl" aria-hidden="true">
            📖
          </p>
        )}
        <div>
          <h2 id="reader-start-title" className="text-3xl font-bold leading-tight sm:text-4xl">
            {title}
          </h2>
          {author ? <p className="mt-1 text-lg text-muted">{author}</p> : null}
          {dedication ? (
            <p className="mt-3 text-xl font-semibold italic leading-relaxed text-foreground">{dedication}</p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button size="lg" className="min-h-16 w-full text-2xl shadow-lift" autoFocus onClick={onRead}>
            <BookOpen aria-hidden="true" className="size-7" />
            {resumePage > 0 ? `נמשיך מעמוד ${resumePage + 1}` : "בואו נקרא"}
          </Button>
          {onListen ? (
            <Button size="lg" variant="secondary" className="w-full" onClick={onListen}>
              <Headphones aria-hidden="true" />
              האזנה לסיפור
            </Button>
          ) : null}
          {download ? <div className="flex justify-center [&>*]:w-full">{download}</div> : null}
        </div>
        {detailsHref ? (
          <Link
            href={detailsHref}
            className="inline-flex min-h-touch items-center gap-1.5 px-3 text-base text-muted underline underline-offset-4 hover:text-foreground"
          >
            <Info aria-hidden="true" className="size-4" />
            לפרטים על הספר
          </Link>
        ) : null}
      </div>
    </div>
  );
}
