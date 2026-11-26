"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { ButtonLink } from "@/components/ui";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import {
  GUEST_BOOK_LIMIT,
  guestMayRead,
  loadGuestBooks,
  rememberGuestBook,
  subscribeGuestBooks,
} from "@/lib/reader/guest-limit";

export interface GuestLimitProps {
  bookId: string;
  /** Sign-in page that returns to this book. */
  loginHref: string;
  /** The book's own page, for the "back" button. */
  backHref: string;
  children: ReactNode;
}

/**
 * Lets a visitor without an account open GUEST_BOOK_LIMIT books; from the next
 * one on, shows an invitation to sign in instead of the reader. The server
 * render (and search engines) always get the reader.
 */
export function GuestLimit({ bookId, loginHref, backHref, children }: GuestLimitProps) {
  const allowed = useSyncExternalStore(
    subscribeGuestBooks,
    () => guestMayRead(loadGuestBooks(), bookId),
    () => true,
  );
  useEffect(() => {
    if (allowed) rememberGuestBook(bookId);
  }, [allowed, bookId]);

  const locale = useLocale();
  const t = READER_MESSAGES[locale].guestLimit;
  if (allowed) return children;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-limit-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-background p-6"
      data-immersive=""
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[1.75rem] bg-surface p-8 text-center shadow-card ring-1 ring-border/60">
        <p aria-hidden="true" className="flex size-20 items-center justify-center rounded-full bg-accent-soft text-5xl">
          📚
        </p>
        <h1 id="guest-limit-title" className="text-3xl font-bold">
          {t.title}
        </h1>
        <p className="text-lg leading-relaxed">{t.description(GUEST_BOOK_LIMIT)}</p>
        <p className="text-muted">{t.alreadyOpen}</p>
        <div className="mt-2 flex w-full flex-col gap-3">
          <ButtonLink href={loginHref} variant="primary" size="lg">
            {t.signIn}
          </ButtonLink>
          <ButtonLink href={backHref} variant="outline">
            {t.back}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
