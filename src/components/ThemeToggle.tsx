"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { applyTheme, readTheme, THEME_EVENT, type Theme } from "@/lib/theme";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Current theme, kept in sync with <html data-theme>. Returns "day" during server rendering. */
export function useTheme(): Theme {
  return useSyncExternalStore<Theme>(subscribe, readTheme, () => "day");
}

export interface ThemeToggleProps {
  className?: string;
}

/** Switches between the day theme and the dark bedtime theme; the choice is saved on the device. */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useTheme();
  const bedtime = theme === "bedtime";
  return (
    <button
      type="button"
      onClick={() => applyTheme(bedtime ? "day" : "bedtime")}
      aria-pressed={bedtime}
      aria-label="מצב לפני השינה"
      title={bedtime ? "חזרה למצב יום" : "מצב לפני השינה"}
      className={cn(
        "inline-flex size-touch shrink-0 items-center justify-center rounded-full text-foreground hover:bg-surface-2",
        className,
      )}
    >
      {bedtime ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
