"use client";

import { Rabbit, Turtle } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { PLAYBACK_RATES } from "@/lib/reader/logic";

export function rateLabel(rate: number, locale: Locale = DEFAULT_LOCALE): string {
  const t = READER_MESSAGES[locale].speed;
  const labels: Record<number, string> = { 0.9: t.slow, 1: t.normal, 1.1: t.fast };
  return labels[rate] ?? `×${rate}`;
}

const ICONS: Record<number, ReactNode> = {
  0.9: <Turtle aria-hidden="true" className="size-6" />,
  1: <span className="text-base font-bold">1×</span>,
  1.1: <Rabbit aria-hidden="true" className="size-6" />,
};

export interface SpeedControlProps {
  rate: number;
  onRate: (rate: number) => void;
}

/** Narration speed as three side-by-side buttons: turtle (slow), normal, rabbit (fast). Lives in the reader settings. */
export function SpeedControl({ rate, onRate }: SpeedControlProps) {
  const locale = useLocale();
  return (
    <div
      role="radiogroup"
      aria-label={READER_MESSAGES[locale].speed.label}
      className="inline-flex items-center gap-0.5 rounded-full bg-secondary-soft p-1"
    >
      {PLAYBACK_RATES.map((value) => {
        const selected = rate === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={rateLabel(value, locale)}
            title={rateLabel(value, locale)}
            onClick={() => onRate(value)}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-full transition-colors duration-150",
              selected ? "bg-secondary text-secondary-foreground shadow-card" : "text-foreground hover:bg-surface-2",
            )}
          >
            {ICONS[value] ?? rateLabel(value, locale)}
          </button>
        );
      })}
    </div>
  );
}
