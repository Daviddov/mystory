import { Search } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { MAX_QUERY_LENGTH } from "./filters";

export interface SearchFormProps {
  defaultValue?: string;
  /** Unique id for the input when several forms are on one page. */
  id?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
  className?: string;
}

/** Free-text search box. A plain GET form to /search, so it needs no JavaScript. */
export function SearchForm({ defaultValue, id = "search-q", autoFocus, size = "md", className }: SearchFormProps) {
  return (
    <form action={routes.search()} method="get" role="search" className={cn("flex w-full items-stretch gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        חיפוש ספרים
      </label>
      <Input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue ?? ""}
        placeholder="מה בא לכם לקרוא? דרקון, גשם, חברים…"
        maxLength={MAX_QUERY_LENGTH}
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        className={cn("rounded-full", size === "lg" && "min-h-touch-lg text-lg")}
      />
      <Button type="submit" size={size === "lg" ? "lg" : "md"} className="px-5">
        <Search aria-hidden="true" className="size-5" />
        <span>חיפוש</span>
      </Button>
    </form>
  );
}
