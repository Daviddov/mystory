"use client";

import { Heart } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { useFavorite } from "./hooks";

export interface FavoriteButtonProps {
  bookId: string;
  /** Book title, used in the accessible name. */
  title?: string;
  /** 'icon' is a round heart; 'label' adds the text next to it. Default 'icon'. */
  variant?: "icon" | "label";
  className?: string;
}

/**
 * Heart toggle. Works for everyone: anonymous favorites stay on the device and
 * move into the account at the next sign-in.
 */
export function FavoriteButton({ bookId, title, variant = "icon", className }: FavoriteButtonProps) {
  const [favorite, toggle] = useFavorite(bookId);
  const t = READER_MESSAGES[useLocale()].favorite;
  const action = favorite ? t.remove : t.add;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorite}
      aria-label={title ? `${action}: ${title}` : action}
      title={action}
      className={cn(
        "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-full font-semibold",
        "border-2 border-border-strong bg-surface text-foreground transition-transform hover:bg-surface-2 active:scale-95",
        variant === "icon" ? "size-touch" : "px-5",
        className,
      )}
    >
      <Heart
        aria-hidden="true"
        className={cn("size-6", favorite ? "fill-danger text-danger" : "text-muted")}
      />
      {variant === "label" ? <span>{favorite ? t.inFavorites : t.toFavorites}</span> : null}
    </button>
  );
}
