"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { BookCard } from "@/components/BookCard";
import { BookCredits, type BookCreditsProps } from "@/components/BookCredits";
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
  /** The book, for the credits every reader sees at the end (authors, translator, license, publisher). */
  creditsBook?: BookCreditsProps["book"];
  /** Share token of an unpublished book opened through its share link (for the publisher logo). */
  mediaToken?: string;
}

/** Shown after the last page: questions to talk about, read again, and what to read next. */
export function EndScreen({
  title,
  discussionQuestions,
  recommendations,
  onReadAgain,
  exit,
  creditsBook,
  mediaToken,
}: EndScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="text-center">
        <p className="text-6xl" aria-hidden="true">
          🎉
        </p>
        <h2 className="mt-2 text-4xl font-bold">סוף הסיפור</h2>
        <p className="mt-2 text-xl text-muted">קראנו את ״{title}״ עד הסוף. כל הכבוד!</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" variant="primary" onClick={onReadAgain}>
            <RotateCcw aria-hidden="true" />
            לקרוא שוב
          </Button>
          {exit}
        </div>
      </header>

      {discussionQuestions.length > 0 ? (
        <section aria-labelledby="reader-questions-title" className="rounded-xl bg-surface p-6 shadow-card">
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

      {creditsBook ? <BookCredits book={creditsBook} variant="compact" headingLevel={3} id="reader-credits" mediaToken={mediaToken} /> : null}

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
    </div>
  );
}
