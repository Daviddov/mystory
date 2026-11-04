"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/locale";
import { READER_MESSAGES } from "@/lib/i18n/reader";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Accessible label. Pass "" when the spinner only decorates other text. Default "טוען…". */
  label?: string;
  className?: string;
  /** Interface language of the default label. Default: the visitor's interface language. */
  locale?: Locale;
}

const SIZES = { sm: "size-4 border-2", md: "size-7 border-[3px]", lg: "size-12 border-4" };

export function Spinner({ size = "md", label: givenLabel, className, locale }: SpinnerProps) {
  const interfaceLocale = useLocale();
  const label = givenLabel ?? READER_MESSAGES[locale ?? interfaceLocale].ui.loading;
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <span className={cn("animate-spin rounded-full border-current border-e-transparent", SIZES[size])} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
