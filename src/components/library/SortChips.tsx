import { Chip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SORT_OPTIONS, type LibrarySort } from "./filters";

export interface SortChipsProps {
  current: LibrarySort;
  hrefFor: (sort: LibrarySort) => string;
  className?: string;
}

/** Sort order as links, so it works without JavaScript and is shareable. */
export function SortChips({ current, hrefFor, className }: SortChipsProps) {
  return (
    <nav aria-label="סדר התצוגה" className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm font-semibold text-muted">סדר:</span>
      {SORT_OPTIONS.map((option) => (
        <Chip key={option.value} href={hrefFor(option.value)} selected={option.value === current}>
          {option.label}
        </Chip>
      ))}
    </nav>
  );
}
