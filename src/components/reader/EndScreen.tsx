"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { BookCard } from "@/components/BookCard";
import { BookCredits, hasCredits, type BookCreditsProps } from "@/components/BookCredits";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui";
import { WhatsAppChannelLink } from "@/components/WhatsAppChannelLink";
import { READER_MESSAGES } from "@/lib/i18n/reader";
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
  /** Rating and share controls, right under the header. */
  feedback?: ReactNode;
  /** Readers' comments, under the discussion questions. */
  comments?: ReactNode;
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

/** Shown after the last page: read again, what to read next (high up, so it shows without scrolling), then rating, questions and comments. */
export function EndScreen({
  title,
  discussionQuestions,
  recommendations,
  onReadAgain,
  exit,
  creditsBook,
  mediaToken,
  staffPanel,
  feedback,
  comments,
}: EndScreenProps) {
  const locale = useLocale();
  const t = READER_MESSAGES[locale].end;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-5">
      <header className="relative text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden">
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
          className="mystory-trophy relative mx-auto flex size-16 items-center justify-center rounded-full bg-accent-soft text-4xl shadow-card"
          aria-hidden="true"
        >
          🎉
        </p>
        <h2 className="relative mt-2 text-3xl font-bold sm:text-4xl">{t.title}</h2>
        <p className="mt-1 text-lg text-muted">
          {t.wellDoneBefore}
          <bdi>{title}</bdi>
          {t.wellDoneAfter}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={onReadAgain}>
            <RotateCcw aria-hidden="true" />
            {t.readAgain}
          </Button>
          {exit}
        </div>
      </header>

      {staffPanel}

      {recommendations.length > 0 ? (
        <section aria-labelledby="reader-next-title">
          <h3 id="reader-next-title" className="mb-3 text-xl font-bold sm:text-2xl">
            <span aria-hidden="true">📚 </span>
            {t.next}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {recommendations.map((book) => (
              <BookCard key={book.id} book={book} href={routes.read(book.slug)} locale={locale} />
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <ButtonLink href={routes.books()} variant="outline">
              {t.moreBooks}
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {feedback ? <div className="flex flex-col items-center gap-4">{feedback}</div> : null}

      {/* The channel posts Hebrew stories, so the English site leaves it out. */}
      {locale === "he" ? <WhatsAppChannelLink /> : null}

      {discussionQuestions.length > 0 ? (
        <section
          aria-labelledby="reader-questions-title"
          className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-border/60 sm:p-8"
        >
          <h3 id="reader-questions-title" className="text-2xl font-bold">
            <span aria-hidden="true">💬 </span>
            {t.questions}
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
                <span dir="auto">{question}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {comments ? (
        <div className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-border/60 sm:p-8">{comments}</div>
      ) : null}

      {/* Credits stay out of the way: a small link that opens them on demand. */}
      {creditsBook && hasCredits(creditsBook) ? (
        <details className="text-center">
          <summary className="inline-flex min-h-touch cursor-pointer list-none items-center px-3 text-base text-muted underline underline-offset-4 hover:text-foreground [&::-webkit-details-marker]:hidden">
            {t.credits}
          </summary>
          <div className="mt-3 text-start">
            <BookCredits
              book={creditsBook}
              variant="compact"
              headingLevel={3}
              id="reader-credits"
              mediaToken={mediaToken}
              locale={locale}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
