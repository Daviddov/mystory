"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { routes } from "@/lib/routes";
import { AGE_GROUP_INFO, CATEGORIES, READING_TIME_BUCKETS, THEMES } from "@/lib/taxonomy";
import { buildHref, parseLibraryQuery, toParams, SORT_OPTIONS, type LibraryQuery } from "./filters";

export interface FilterFormProps {
  /** The query currently shown; used as the initial value of every control. */
  query: LibraryQuery;
  /** The "read" filter is per user, so it is offered to signed-in visitors only. */
  signedIn?: boolean;
}

/**
 * Combinable filters of the "all books" page. A plain GET form to /books, so
 * it works without JavaScript; with JavaScript every select applies at once
 * and the URL stays free of empty parameters.
 */
export function FilterForm({ query, signedIn = false }: FilterFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(form: HTMLFormElement) {
    const data = new FormData(form);
    const raw: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value === "string") raw[key] = value;
    }
    // Re-validated here and again on the server. The page always restarts at 1.
    const next = parseLibraryQuery(raw);
    startTransition(() => router.push(buildHref(routes.books(), toParams({ ...next, page: 1 }))));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLSelectElement || (event.target instanceof HTMLInputElement && event.target.type === "checkbox")) apply(event.currentTarget);
  }

  // Remount when the URL changes so the controls follow back/forward navigation.
  const formKey = JSON.stringify(toParams(query));

  return (
    <form
      key={formKey}
      action={routes.books()}
      method="get"
      role="search"
      aria-label="סינון ספרים"
      aria-busy={pending || undefined}
      onSubmit={onSubmit}
      onChange={onChange}
      className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-lg border border-border bg-surface p-4 shadow-card md:grid-cols-3 lg:grid-cols-6"
    >
      <div className="col-span-2 flex flex-col gap-1.5 md:col-span-3 lg:col-span-2">
        <Label htmlFor="filter-q">חיפוש חופשי</Label>
        <Input
          id="filter-q"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          placeholder="שם ספר, דמות או נושא"
          maxLength={100}
          enterKeyHint="search"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-age">גיל</Label>
        <Select id="filter-age" name="age" defaultValue={query.age ?? ""}>
          <option value="">כל הגילים</option>
          {AGE_GROUP_INFO.map((age) => (
            <option key={age.slug} value={age.slug}>
              {age.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-category">קטגוריה</Label>
        <Select id="filter-category" name="category" defaultValue={query.category ?? ""}>
          <option value="">כל הקטגוריות</option>
          {CATEGORIES.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-time">זמן קריאה</Label>
        <Select id="filter-time" name="time" defaultValue={query.time ?? ""}>
          <option value="">כל משך</option>
          {READING_TIME_BUCKETS.map((bucket) => (
            <option key={bucket.slug} value={bucket.slug}>
              {bucket.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-theme">נושא לשיחה</Label>
        <Select id="filter-theme" name="theme" defaultValue={query.theme ?? ""}>
          <option value="">כל הנושאים</option>
          {THEMES.map((theme) => (
            <option key={theme.slug} value={theme.slug}>
              {theme.label}
            </option>
          ))}
        </Select>
      </div>

      {signedIn ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-read">סטטוס קריאה</Label>
          <Select id="filter-read" name="read" defaultValue={query.read ?? ""}>
            <option value="">הכול</option>
            <option value="unread">עוד לא נקראו</option>
            <option value="read">נקראו</option>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-sort">סדר</Label>
        <Select id="filter-sort" name="sort" defaultValue={query.sort}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-3 lg:col-span-6">
        <legend className="sr-only">סוג התוכן</legend>
        {(
          [
            ["audio", "🔊 עם השמעה", query.audio],
            ["nikud", "אָ עם ניקוד", query.nikud],
            ["anim", "🎬 עם הנפשות", query.anim],
          ] as const
        ).map(([name, label, checked]) => (
          <label key={name} className="inline-flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" name={name} value="1" defaultChecked={checked === true} className="size-5 accent-primary" />
            {label}
          </label>
        ))}
      </fieldset>

      {/* A tag arrives from a tag link; keep it while the other filters change. */}
      {query.tag ? <input type="hidden" name="tag" value={query.tag} /> : null}

      <div className="flex items-end">
        <Button type="submit" fullWidth loading={pending}>
          הצגה
        </Button>
      </div>
    </form>
  );
}
