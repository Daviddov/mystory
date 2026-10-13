import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { ButtonLink, Chip } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { getAgeGroup, readingTimeLabel } from "@/lib/taxonomy";
import type { Book } from "@/lib/types";

export interface HeroBookProps {
  book: Book;
  /** Heading above the title: "ספר השבוע", or another label when no book was chosen. */
  label: string;
}

/** The large "book of the week" banner at the top of the home page. */
export function HeroBook({ book, label }: HeroBookProps) {
  const cover = mediaUrl(book.coverImage, book.updatedAt);
  const age = getAgeGroup(book.ageGroup);
  return (
    <section
      aria-labelledby="hero-book-title"
      className="grid items-center gap-6 rounded-xl bg-surface-2 p-5 shadow-card sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-8 sm:p-8 lg:grid-cols-[minmax(0,17rem)_1fr]"
    >
      <Link
        href={routes.book(book.slug)}
        aria-hidden="true"
        tabIndex={-1}
        className="mx-auto block w-44 sm:w-full"
      >
        <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface shadow-pop">
          {cover ? (
            <img src={cover} alt="" loading="eager" fetchPriority="high" decoding="async" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-7xl">📖</div>
          )}
        </div>
      </Link>
      <div className="flex flex-col items-start gap-4">
        <p className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-base font-bold text-accent-foreground">
          <span aria-hidden="true">⭐</span>
          {label}
        </p>
        <h2 id="hero-book-title" className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
          {book.title}
        </h2>
        {book.summary ? (
          <p className="line-clamp-4 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">{book.summary}</p>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {age ? (
            <li>
              <Chip href={routes.age(age.slug)} icon={age.emoji} tone="secondary" size="sm" className="min-h-9 bg-surface">
                {age.label}
              </Chip>
            </li>
          ) : null}
          <li>
            <Chip icon={<Clock className="size-4" />} size="sm" className="min-h-9 bg-surface">
              {readingTimeLabel(book.readingMinutes)}
            </Chip>
          </li>
        </ul>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={routes.read(book.slug)} size="lg" className="w-full sm:w-auto">
            <BookOpen aria-hidden="true" />
            בואו נקרא
          </ButtonLink>
          <ButtonLink href={routes.book(book.slug)} variant="outline" size="lg" className="w-full sm:w-auto">
            על הספר
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
