"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, adminPaths } from "@/app/admin/_lib/paths";
import {
  inPipelineView,
  isNarrated,
  PIPELINE_VIEW_LABELS,
  PIPELINE_VIEWS,
  type PipelineRow,
  type PipelineView,
} from "@/app/admin/_lib/readiness";
import { Button, Card, Chip, Dialog, EmptyState, Input, Label, Select } from "@/components/ui";
import { normalizeForSearch } from "@/lib/hebrew";
import { routes } from "@/lib/routes";
import { narrate } from "@/lib/studio/client";
import { MAX_CATEGORIES, MAX_THEMES } from "@/lib/studio/shared";
import { AGE_GROUP_INFO, CATEGORIES, categoryLabel, THEMES } from "@/lib/taxonomy";
import type { AgeGroup } from "@/lib/types";
import { adminRequest } from "./request";
import { StatusChip } from "./StatusChip";

export interface PipelineBoardProps {
  rows: PipelineRow[];
  initialView: PipelineView;
  /** No real narration service is configured: narrating stores silent demo audio. */
  ttsMock: boolean;
}

interface RunState {
  /** Zero-based position of the book being narrated. */
  index: number;
  total: number;
  title: string;
  pageDone: number;
  pageTotal: number;
}

interface Report {
  kind: "error" | "info";
  summary: string;
  failures: { title: string; error: string }[];
}

interface BulkResponse {
  results: { id: string; ok: boolean; error?: string }[];
}

const NUMBER = new Intl.NumberFormat("he-IL");
const MAX_FAILURES_SHOWN = 30;

function books(count: number): string {
  return count === 1 ? "ספר אחד" : `${NUMBER.format(count)} ספרים`;
}

function toggled<T>(list: T[], item: T, max: number): T[] {
  if (list.includes(item)) return list.filter((value) => value !== item);
  return list.length >= max ? list : [...list, item];
}

/** The publishing pipeline: what every book lacks, and narration, details and publication for many books at once. */
export function PipelineBoard({ rows, initialView, ttsMock }: PipelineBoardProps) {
  const router = useRouter();
  const [view, setView] = useState<PipelineView>(initialView);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<"narrate" | "publish" | "meta" | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const stopRequested = useRef(false);
  const [stopping, setStopping] = useState(false);

  const [metaCategories, setMetaCategories] = useState<string[]>([]);
  const [metaThemes, setMetaThemes] = useState<string[]>([]);
  const [metaAge, setMetaAge] = useState<AgeGroup | "">("");
  const [metaMode, setMetaMode] = useState<"add" | "replace">("add");

  const counts = useMemo(
    () =>
      Object.fromEntries(
        PIPELINE_VIEWS.map((key) => [key, rows.filter((row) => inPipelineView(row, key)).length]),
      ) as Record<PipelineView, number>,
    [rows],
  );
  const visible = useMemo(() => {
    const needle = normalizeForSearch(query.trim());
    return rows.filter(
      (row) =>
        inPipelineView(row, view) &&
        (needle === "" || normalizeForSearch(`${row.title} ${row.author} ${row.id}`).includes(needle)),
    );
  }, [rows, view, query]);
  // Actions apply only to what is both ticked and on screen, so a hidden tick can never be acted on.
  const chosen = useMemo(() => visible.filter((row) => selected.has(row.id)), [visible, selected]);
  const allChosen = visible.length > 0 && chosen.length === visible.length;

  const toNarrate = chosen.filter((row) => !isNarrated(row));
  const narrationChars = toNarrate.reduce((sum, row) => sum + row.charsToNarrate, 0);
  const publishable = chosen.filter((row) => row.status !== "published" && row.missing.length === 0);
  const publishSilent = publishable.filter((row) => !isNarrated(row)).length;
  const working = busy || run !== null;

  // Leaving in the middle of a run stops it after the page that is being narrated.
  useEffect(() => {
    if (!run) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [run]);

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of visible) {
        if (allChosen) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });
  }

  async function runNarration() {
    const targets = toNarrate;
    setDialog(null);
    setReport(null);
    stopRequested.current = false;
    setStopping(false);
    const failures: Report["failures"] = [];
    let finished = 0;
    let pages = 0;
    let unavailable = false;
    for (const [index, row] of targets.entries()) {
      if (stopRequested.current) break;
      setRun({ index, total: targets.length, title: row.title, pageDone: 0, pageTotal: row.pageCount });
      const outcome = await narrate(row.id, {}, (pageDone, pageTotal) =>
        setRun({ index, total: targets.length, title: row.title, pageDone, pageTotal }),
      );
      pages += outcome.narrated;
      if (!outcome.available) {
        // The service itself refused (not configured, signed out...): the next book would fail the same way.
        failures.push({ title: row.title, error: outcome.message ?? "ההקראה נכשלה" });
        unavailable = true;
        break;
      }
      if (outcome.failed > 0) {
        const firstError = outcome.pages.find((page) => page.status === "failed")?.error;
        failures.push({
          title: row.title,
          error: `${NUMBER.format(outcome.failed)} עמודים נכשלו${firstError ? ` (${firstError})` : ""}`,
        });
      } else finished += 1;
    }
    setRun(null);
    const stopped = stopRequested.current && finished + failures.length < targets.length;
    setReport({
      kind: failures.length > 0 ? "error" : "info",
      summary:
        `הוקראו ${NUMBER.format(pages)} עמודים; ${books(finished)} הושלמו מתוך ${NUMBER.format(targets.length)}.` +
        (unavailable ? " הריצה נעצרה כי שירות ההקראה לא זמין." : stopped ? " הריצה נעצרה לבקשתכם." : "") +
        (failures.length > 0 ? " אפשר להריץ שוב: עמודים שכבר הוקראו לא יוקראו פעמיים." : ""),
      failures,
    });
    router.refresh();
  }

  async function runBulk(body: Record<string, unknown>, done: (count: number) => string) {
    const titles = new Map(chosen.map((row) => [row.id, row.title]));
    setBusy(true);
    setReport(null);
    const result = await adminRequest<BulkResponse>(adminApi.booksBulk(), "POST", body);
    setBusy(false);
    setDialog(null);
    if (!result.ok) {
      setReport({ kind: "error", summary: result.error, failures: [] });
      return;
    }
    const failures = result.data.results
      .filter((item) => !item.ok)
      .map((item) => ({ title: titles.get(item.id) ?? item.id, error: item.error ?? "הפעולה נכשלה" }));
    setReport({
      kind: failures.length > 0 ? "error" : "info",
      summary: done(result.data.results.length - failures.length),
      failures,
    });
    router.refresh();
  }

  const publish = () =>
    runBulk({ action: "publish", ids: publishable.map((row) => row.id) }, (count) => `${books(count)} פורסמו בספרייה.`);

  const applyMeta = () =>
    runBulk(
      {
        action: "meta",
        ids: chosen.map((row) => row.id),
        mode: metaMode,
        ...(metaAge ? { ageGroup: metaAge } : {}),
        ...(metaCategories.length > 0 ? { categories: metaCategories } : {}),
        ...(metaThemes.length > 0 ? { themes: metaThemes } : {}),
      },
      (count) => `הפרטים עודכנו ב-${books(count)}.`,
    );

  const metaEmpty = metaAge === "" && metaCategories.length === 0 && metaThemes.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי מה שחסר">
        {PIPELINE_VIEWS.map((key) => (
          <Chip key={key} selected={view === key} onClick={() => setView(key)}>
            {PIPELINE_VIEW_LABELS[key]} ({NUMBER.format(counts[key])})
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="pipeline-q">חיפוש</Label>
          <Input
            id="pipeline-q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם ספר או מחבר…"
          />
        </div>
        <Button variant="outline" disabled={working || chosen.length === 0} onClick={() => setDialog("meta")}>
          קטגוריות וגיל
        </Button>
        <Button variant="secondary" disabled={working || toNarrate.length === 0} onClick={() => setDialog("narrate")}>
          ניקוד והקראה{toNarrate.length > 0 ? ` (${NUMBER.format(toNarrate.length)})` : ""}
        </Button>
        <Button disabled={working || publishable.length === 0} onClick={() => setDialog("publish")}>
          פרסום{publishable.length > 0 ? ` (${NUMBER.format(publishable.length)})` : ""}
        </Button>
      </div>

      {run ? (
        <Card tone="soft" className="flex flex-wrap items-center gap-4" role="status">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              מקריא ספר {NUMBER.format(run.index + 1)} מתוך {NUMBER.format(run.total)}: {run.title}
            </p>
            <p className="text-muted">
              עמוד {NUMBER.format(run.pageDone)} מתוך {NUMBER.format(run.pageTotal)}. השאירו את הלשונית פתוחה עד הסיום.
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div
                className="h-full rounded-full bg-secondary"
                style={{ width: `${((run.index + run.pageDone / Math.max(1, run.pageTotal)) / run.total) * 100}%` }}
              />
            </div>
          </div>
          <Button
            variant="outline"
            disabled={stopping}
            onClick={() => {
              stopRequested.current = true;
              setStopping(true);
            }}
          >
            {stopping ? "עוצר אחרי הספר הזה…" : "עצירה"}
          </Button>
        </Card>
      ) : null}

      {report ? (
        <Card role={report.kind === "error" ? "alert" : "status"} className="flex flex-col gap-2">
          <p className="font-semibold">{report.summary}</p>
          {report.failures.length > 0 ? (
            <>
              <p className="text-danger">{books(report.failures.length)} לא טופלו:</p>
              <ul className="list-disc ps-5 text-sm">
                {report.failures.slice(0, MAX_FAILURES_SHOWN).map((failure) => (
                  <li key={failure.title}>
                    <span className="font-semibold">{failure.title}</span>: {failure.error}
                  </li>
                ))}
              </ul>
              {report.failures.length > MAX_FAILURES_SHOWN ? (
                <p className="text-sm text-muted">
                  ועוד {NUMBER.format(report.failures.length - MAX_FAILURES_SHOWN)}. הם נשארים ברשימה שלמטה.
                </p>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState icon="🔍" title="אין ספרים ברשימה הזאת" description="בחרו סינון אחר או נקו את החיפוש." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[52rem] border-collapse text-start">
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th scope="col" className="w-12 p-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={allChosen}
                    disabled={working}
                    onChange={toggleAll}
                    aria-label={`בחירת כל ${NUMBER.format(visible.length)} הספרים ברשימה`}
                  />
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  ספר ({NUMBER.format(chosen.length)} נבחרו מתוך {NUMBER.format(visible.length)})
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  סטטוס
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  מה חסר
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  הקראה
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  קטגוריות
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={selected.has(row.id)}
                      disabled={working}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`בחירת הספר ${row.title}`}
                    />
                  </td>
                  <th scope="row" className="p-3 text-start font-normal">
                    <Link href={adminPaths.book(row.id)} className="font-semibold underline">
                      {row.title}
                    </Link>
                    <div className="text-sm text-muted">
                      {row.author || "בלי מחבר"} · {NUMBER.format(row.pageCount)} עמודים
                    </div>
                    <Link href={routes.studioBook(row.id)} className="text-sm underline">
                      עריכה בסטודיו
                    </Link>
                  </th>
                  <td className="p-3">
                    <StatusChip status={row.status} />
                  </td>
                  <td className="p-3">
                    {row.missing.length === 0 ? (
                      <Chip tone="success">הפרטים מלאים</Chip>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {row.missing.map((label) => (
                          <Chip key={label} tone="warning">
                            {label}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap p-3 tabular-nums">
                    <Chip tone={isNarrated(row) ? "success" : row.narratedPages > 0 ? "warning" : "neutral"}>
                      {NUMBER.format(row.narratedPages)} מתוך {NUMBER.format(row.textPages)}
                    </Chip>
                    <div className="mt-1 text-sm text-muted">ניקוד: {NUMBER.format(row.nikudPages)}</div>
                  </td>
                  <td className="p-3 text-sm">
                    {row.categories.length > 0 ? row.categories.map(categoryLabel).join(", ") : "אין"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialog === "narrate"}
        onClose={() => setDialog(null)}
        title="ניקוד והקראה"
        description={`${books(toNarrate.length)} יוקראו בזה אחר זה. עמודים שכבר מוקראים לא יוקראו שוב.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              ביטול
            </Button>
            <Button variant="secondary" onClick={runNarration}>
              להתחיל
            </Button>
          </>
        }
      >
        <p>
          {ttsMock
            ? "שירות ההקראה לא מחובר, ולכן ייווצרו הקלטות שקטות לדוגמה בלבד."
            : `כ-${NUMBER.format(narrationChars)} תווים יישלחו לשירות ההקראה, שגובה תשלום לפי תווים.`}
        </p>
        <p className="mt-2 text-muted">
          הריצה מתבצעת מהלשונית הזאת וצריך להשאיר אותה פתוחה. אפשר לעצור באמצע ולהמשיך אחר כך מאותה נקודה.
        </p>
      </Dialog>

      <Dialog
        open={dialog === "publish"}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        size="sm"
        title="פרסום בספרייה"
        description={`${books(publishable.length)} יפורסמו בספרייה הציבורית ויהיו פתוחים לכל קורא.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>
              ביטול
            </Button>
            <Button loading={busy} onClick={publish}>
              לפרסם
            </Button>
          </>
        }
      >
        {publishSilent > 0 ? <p>{books(publishSilent)} מתוכם עדיין בלי הקראה מלאה.</p> : null}
        {chosen.length > publishable.length ? (
          <p className="mt-2 text-muted">
            {books(chosen.length - publishable.length)} מהנבחרים לא יפורסמו, כי חסרים בהם פרטים או שהם כבר מפורסמים.
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "meta"}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title="קטגוריות וגיל"
        description={`השינוי יחול על ${books(chosen.length)}.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>
              ביטול
            </Button>
            <Button loading={busy} disabled={metaEmpty} onClick={applyMeta}>
              לעדכן
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">קטגוריות (עד {MAX_CATEGORIES})</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Chip
                  key={category.slug}
                  size="sm"
                  icon={category.emoji}
                  selected={metaCategories.includes(category.slug)}
                  onClick={() => setMetaCategories((list) => toggled(list, category.slug, MAX_CATEGORIES))}
                >
                  {category.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">נושאי שיחה (עד {MAX_THEMES})</legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((theme) => (
                <Chip
                  key={theme.slug}
                  size="sm"
                  icon={theme.emoji}
                  selected={metaThemes.includes(theme.slug)}
                  onClick={() => setMetaThemes((list) => toggled(list, theme.slug, MAX_THEMES))}
                >
                  {theme.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pipeline-age">קבוצת גיל</Label>
              <Select
                id="pipeline-age"
                value={metaAge}
                onChange={(event) => setMetaAge(event.target.value as AgeGroup | "")}
                className="w-auto"
              >
                <option value="">בלי שינוי</option>
                {AGE_GROUP_INFO.map((age) => (
                  <option key={age.slug} value={age.slug}>
                    {age.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pipeline-mode">קטגוריות ונושאים קיימים</Label>
              <Select
                id="pipeline-mode"
                value={metaMode}
                onChange={(event) => setMetaMode(event.target.value as "add" | "replace")}
                className="w-auto"
              >
                <option value="add">להוסיף עליהם</option>
                <option value="replace">להחליף אותם</option>
              </Select>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
