"use client";

import { Rabbit, Turtle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PLAYBACK_RATES } from "@/lib/reader/logic";
import { rateLabel } from "./ReaderSettings";

const ICONS: Record<number, ReactNode> = {
  0.9: <Turtle aria-hidden="true" className="size-6" />,
  1: <span className="text-base font-bold">1×</span>,
  1.1:<Rabbit aria-hidden="true" className="size-6" />,
};

export interface SpeedControlProps {
  rate: number;
  onRate: (rate: number) => void;
}

/** Narration speed as three side-by-side buttons: turtle (slow), normal, rabbit (fast). */
export function SpeedControl({ rate, onRate }: SpeedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label="מהירות ההקראה"
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
            aria-label={rateLabel(value)}
            title={rateLabel(value)}
            onClick={() => onRate(value)}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-full transition-colors duration-150",
              selected ? "bg-secondary text-secondary-foreground shadow-card" : "text-foreground hover:bg-surface-2",
            )}
          >
            {ICONS[value] ?? rateLabel(value)}
          </button>
        );
      })}
    </div>
  );
}
