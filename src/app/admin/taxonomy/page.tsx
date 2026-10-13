import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardDescription, CardTitle, Chip } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { getCategory, getTheme } from "@/lib/taxonomy";
import { requireAdminPage } from "../_lib/guard";
import { adminPaths } from "../_lib/paths";
import { computeTaxonomyUsage, type UsageRow } from "../_lib/service";

export const metadata: Metadata = { title: "תגיות ונושאים" };
export const dynamic = "force-dynamic";

interface DisplayRow {
  key: string;
  label: ReactNode;
  href: string;
  row: UsageRow;
  note?: string;
}

function UsageTable({ caption, nameHeader, rows }: { caption: string; nameHeader: string; rows: DisplayRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.row.total));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-sm text-muted">
          <tr>
            <th scope="col" className="p-2 text-start font-semibold">
              {nameHeader}
            </th>
            <th scope="col" className="p-2 text-start font-semibold">
              ספרים
            </th>
            <th scope="col" className="p-2 text-start font-semibold">
              מהם מפורסמים
            </th>
            <th scope="col" className="w-1/3 p-2">
              <span className="sr-only">שיעור השימוש</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, href, row, note }) => (
            <tr key={key} className="border-t border-border">
              <th scope="row" className="p-2 text-start font-normal">
                <Link href={href} className="font-medium underline">
                  {label}
                </Link>
                {note ? (
                  <Chip tone="warning" className="ms-2">
                    {note}
                  </Chip>
                ) : null}
              </th>
              <td className="p-2 tabular-nums">{row.total}</td>
              <td className="p-2 tabular-nums">{row.published}</td>
              <td className="p-2" aria-hidden="true">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${(row.total / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminTaxonomyPage() {
  await requireAdminPage(adminPaths.taxonomy());
  const repo = await getRepo();
  const { books } = await repo.listBooks({ status: "any" });
  const usage = computeTaxonomyUsage(books);

  const themeRows: DisplayRow[] = usage.themes.map((row) => {
    const theme = getTheme(row.key);
    return {
      key: row.key,
      label: theme ? `${theme.emoji} ${theme.label}` : row.key,
      href: routes.theme(row.key),
      row,
      note: theme ? undefined : "לא מוכר במערכת",
    };
  });
  const categoryRows: DisplayRow[] = usage.categories.map((row) => {
    const category = getCategory(row.key);
    return {
      key: row.key,
      label: category ? `${category.emoji} ${category.label}` : row.key,
      href: routes.category(row.key),
      row,
      note: category ? undefined : "לא מוכרת במערכת",
    };
  });
  const tagRows: DisplayRow[] = usage.tags.map((row) => ({
    key: row.key,
    label: row.key,
    href: routes.tag(row.key),
    row,
    note: row.known ? undefined : "תגית חופשית",
  }));
  const unusedThemes = usage.themes.filter((r) => r.total === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted">
        הספירה כוללת את כל {usage.totalBooks} הספרים באתר, בכל סטטוס. את התגיות והנושאים של ספר עורכים בסטודיו; רשימת
        הנושאים והקטגוריות עצמה קבועה בקוד.
      </p>

      <Card as="section" aria-labelledby="themes-heading" className="flex flex-col gap-3">
        <CardTitle id="themes-heading">נושאים לשיחה</CardTitle>
        <CardDescription>
          {unusedThemes > 0 ? `${unusedThemes} נושאים עדיין בלי אף ספר. ` : ""}
          {usage.withoutTheme > 0 ? `${usage.withoutTheme} ספרים בלי נושא.` : "לכל הספרים יש נושא."}
        </CardDescription>
        <UsageTable caption="שימוש בנושאים" nameHeader="נושא" rows={themeRows} />
      </Card>

      <Card as="section" aria-labelledby="tags-heading" className="flex flex-col gap-3">
        <CardTitle id="tags-heading">תגיות</CardTitle>
        <CardDescription>
          {usage.tags.length} תגיות בשימוש.{" "}
          {usage.untagged > 0 ? `${usage.untagged} ספרים בלי תגיות.` : "לכל הספרים יש תגיות."}{" "}
          {'הסימון "תגית חופשית" מציין תגית שאינה ברשימת התגיות המוצעות, וכדאי לבדוק שאינה שגיאת כתיב.'}
        </CardDescription>
        {tagRows.length > 0 ? <UsageTable caption="שימוש בתגיות" nameHeader="תגית" rows={tagRows} /> : null}
      </Card>

      <Card as="section" aria-labelledby="categories-heading" className="flex flex-col gap-3">
        <CardTitle id="categories-heading">קטגוריות</CardTitle>
        <CardDescription>
          {usage.withoutCategory > 0 ? `${usage.withoutCategory} ספרים בלי קטגוריה.` : "לכל הספרים יש קטגוריה."}
        </CardDescription>
        <UsageTable caption="שימוש בקטגוריות" nameHeader="קטגוריה" rows={categoryRows} />
      </Card>
    </div>
  );
}
