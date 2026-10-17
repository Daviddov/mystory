"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { BookCard } from "@/components/BookCard";
import { BookCredits, hasCredits, type BookCreditsProps } from "@/components/BookCredits";
import { Button } from "@/components/ui";
import { routes } from "@/lib/routes";
import type { PublicBook } from "@/lib/public-book";

export interface EndScreenProps {
  title: string;
  discussionQuestions: string[];
  recommendations: PublicBook[];
  onReadAgain: () => void;
  /** Exit control (a link or a button), rendered next to "read again". */
  exit?: ReactNode;
  /** The book, for the credits link at the end (authors, translator, license, publisher). */
  creditsBook?: BookCreditsProps["book"];
  /** Share token of an unpublished book opened through its share link (for the publisher logo). */
  mediaToken?: string;
  /** Extra panel right under the header (the publish panel an editor sees on an unpublished book). */
  staffPanel?: ReactNode;
}

/** Emoji that fall once behind the "end of story" heading (skipped under reduced motion). */
const CONFETTI = [
  { emoji: "⭐", x: 8, delay: 0 },
  { emoji: "🎈", x: 22, delay: 0.3 },
  { emoji: "✨", x: 36, delay: 0.1 },
  { emoji: "🌟", x: 64, delay: 0.4 },
  { emoji: "🎊", x: 78, delay: 0.2 },
  { emoji: "⭐", x: 90, delay: 0.5 },
];

/** Shown after the last page: questions to talk about, read again, and what to read next. */
export function EndScreen({
  title,
  discussionQuestions,
  recommendations,
  onReadAgain,
  exit,
  creditsBook,
  mediaToken,
  staffPanel,
}: EndScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="relative text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
          {CONFETTI.map((piece, i) => (
            <span
              key={i}
              className="mystory-confetti absolute top-0 text-2xl"
              style={{ insetInlineStart: `${piece.x}%`, animationDelay: `${piece.delay}s` }}
            >
              {piece.emoji}
            </span>
          ))}
        </div>
        <p
          className="mystory-trophy relative mx-auto flex size-28 items-center justify-center rounded-full bg-accent-soft text-6xl shadow-card"
          aria-hidden="true"
        >
          🎉
        </p>
        <h2 className="relative mt-4 text-4xl font-bold sm:text-5xl">סוף הסיפור</h2>
        <p className="mt-2 text-xl text-muted">קראנו את ״{title}״ עד הסוף. כל הכבוד!</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" variant="primary" onClick={onReadAgain}>
            <RotateCcw aria-hidden="true" />
            לקרוא שוב
          </Button>
          {exit}
        </div>
      </header>

      {staffPanel}

      {discussionQuestions.length > 0 ? (
        <section
          aria-labelledby="reader-questions-title"
          className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-border/60 sm:p-8"
        >
          <h3 id="reader-questions-title" className="text-2xl font-bold">
            <span aria-hidden="true">💬 </span>
            על מה אפשר לדבר?
          </h3>
          <ol className="mt-4 flex flex-col gap-3 text-xl leading-relaxed">
            {discussionQuestions.map((question, index) => (
              <li key={index} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground"
                >
                  {index + 1}
                </span>
                <span>{question}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {recommendations.length > 0 ? (
        <section aria-labelledby="reader-next-title">
          <h3 id="reader-next-title" className="mb-4 text-2xl font-bold">
            <span aria-hidden="true">📚 </span>
            מה קוראים עכשיו?
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {recommendations.map((book) => (
              <BookCard key={book.id} book={book} href={routes.read(book.slug)} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Credits stay out of the way: a small link that opens them on demand. */}
      {creditsBook && hasCredits(creditsBook) ? (
        <details className="text-center">
          <summary className="inline-flex min-h-touch cursor-pointer list-none items-center px-3 text-base text-muted underline underline-offset-4 hover:text-foreground [&::-webkit-details-marker]:hidden">
            קרדיטים ורישיון
          </summary>
          <div className="mt-3 text-start">
            <BookCredits
              book={creditsBook}
              variant="compact"
              headingLevel={3}
              id="reader-credits"
              mediaToken={mediaToken}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
