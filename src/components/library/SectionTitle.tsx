import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SectionTitleProps {
  id?: string;
  children: ReactNode;
  /** Emoji shown in a round badge before the title. */
  emoji?: string;
  /** Optional "see all" link on the far side. */
  href?: string;
  hrefLabel?: ReactNode;
  className?: string;
}

/** Heading row of a home-page section: emoji badge, title and an optional "see all" link. */
export function SectionTitle({ id, children, emoji, href, hrefLabel, className }: SectionTitleProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <h2 id={id} className="flex min-w-0 items-center gap-3 text-2xl font-semibold sm:text-3xl">
        {emoji ? (
          <span aria-hidden="true" className="heading-badge">
            {emoji}
          </span>
        ) : null}
        <span className="min-w-0 break-words">{children}</span>
      </h2>
      {href ? (
        <Link
          href={href}
          className="ms-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-surface px-4 text-sm font-semibold text-secondary shadow-card transition-colors hover:bg-secondary-soft sm:text-base"
        >
          {hrefLabel}
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
      ) : null}
    </div>
  );
}
