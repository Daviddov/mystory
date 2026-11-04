"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button, Input, Label, Select } from "@/components/ui";
import { taxonomyText } from "@/lib/i18n/messages";
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
  const { locale, t: messages } = useT();
  const t = messages.library.filter;

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
      aria-label={t.form}
      aria-busy={pending || undefined}
      onSubmit={onSubmit}
      onChange={onChange}
      className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-lg border border-border bg-surface p-4 shadow-card md:grid-cols-3 lg:grid-cols-6"
    >
      <div className="col-span-2 flex flex-col gap-1.5 md:col-span-3 lg:col-span-2">
        <Label htmlFor="filter-q">{t.q}</Label>
        <Input
          id="filter-q"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          placeholder={t.qPlaceholder}
          maxLength={100}
          enterKeyHint="search"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-age">{t.age}</Label>
        <Select id="filter-age" name="age" defaultValue={query.age ?? ""}>
          <option value="">{t.allAges}</option>
          {AGE_GROUP_INFO.map((age) => (
            <option key={age.slug} value={age.slug}>
              {taxonomyText(locale, "age", age.slug, age).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-category">{t.category}</Label>
        <Select id="filter-category" name="category" defaultValue={query.category ?? ""}>
          <option value="">{t.allCategories}</option>
          {CATEGORIES.map((category) => (
            <option key={category.slug} value={category.slug}>
              {taxonomyText(locale, "category", category.slug, category).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-time">{t.time}</Label>
        <Select id="filter-time" name="time" defaultValue={query.time ?? ""}>
          <option value="">{t.allTimes}</option>
          {READING_TIME_BUCKETS.map((bucket) => (
            <option key={bucket.slug} value={bucket.slug}>
              {taxonomyText(locale, "time", bucket.slug, bucket).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-theme">{t.theme}</Label>
        <Select id="filter-theme" name="theme" defaultValue={query.theme ?? ""}>
          <option value="">{t.allThemes}</option>
          {THEMES.map((theme) => (
            <option key={theme.slug} value={theme.slug}>
              {taxonomyText(locale, "theme", theme.slug, theme).label}
            </option>
          ))}
        </Select>
      </div>

      {signedIn ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-read">{t.read}</Label>
          <Select id="filter-read" name="read" defaultValue={query.read ?? ""}>
            <option value="">{t.readAll}</option>
            <option value="unread">{t.unread}</option>
            <option value="read">{t.readOnly}</option>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-sort">{t.sort}</Label>
        <Select id="filter-sort" name="sort" defaultValue={query.sort}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {messages.library.sort[option.value]}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-3 lg:col-span-6">
        <legend className="sr-only">{t.kind}</legend>
        {(
          [
            ["audio", `🔊 ${t.audio}`, query.audio],
            ["nikud", `אָ ${t.nikud}`, query.nikud],
            ["anim", `🎬 ${t.anim}`, query.anim],
          ] as const
        ).map(([name, label, checked]) => (
          <label key={name} className="inline-flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" name={name} value="1" defaultChecked={checked === true} className="size-5 accent-primary" />
            {label}
          </label>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" name="lang" value="ar" defaultChecked={query.lang === "ar"} className="size-5 accent-primary" />
          <span>
            {t.arabic}{" "}
            <span lang="ar" className="text-muted">
              (كتب بالعربية)
            </span>
          </span>
        </label>
      </fieldset>

      {/* A tag arrives from a tag link; keep it while the other filters change. */}
      {query.tag ? <input type="hidden" name="tag" value={query.tag} /> : null}

      <div className="flex items-end">
        <Button type="submit" fullWidth loading={pending}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
