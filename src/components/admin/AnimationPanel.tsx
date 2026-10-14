"use client";

import { Clapperboard, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { MockNotice } from "@/components/MockNotice";
import { Button, Dialog } from "@/components/ui";
import type {
  AnimationEvent,
  BookAnimationRemoval,
  BookAnimationSummary,
  PageAnimationResult,
  PageAnimationSkipReason,
} from "@/lib/animation/types";
import { adminRequest } from "./request";

export interface AnimationPanelProps {
  bookId: string;
  title: string;
  /** Dry run of the current state (computed on the server), or null when it could not be computed. */
  estimate: BookAnimationSummary | null;
  /** Hebrew reason when the book's license forbids animation. */
  licenseRefusal?: string;
  /** Pages that have a clip now (zero-based). */
  animatedPages: number[];
  /** Only admins may start a paid run. */
  canRun: boolean;
}

const SKIP_LABELS: Record<PageAnimationSkipReason, string> = {
  "no-image": "אין איור",
  "up-to-date": "כבר מונפש",
  "kept-real-video": "נשמרה ההנפשה האמיתית (שירות הווידאו לא מחובר)",
  "placeholder-image": "האיור הוא איור לדוגמה, ולכן לא הונפש",
  "unsupported-image": "סוג הקובץ של האיור אינו נתמך",
  stale: "האיור השתנה בזמן ההנפשה, ולכן ההנפשה לא נשמרה",
  "would-animate": "יונפש",
};

const MOCK_VIDEO_MESSAGE =
  "מצב הדגמה: שירות הווידאו לא מחובר, ולכן נוצרים סרטונים זמניים לדוגמה (משטח צבע אחיד) במקום הנפשה אמיתית.";

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function resultLabel(result: PageAnimationResult): string {
  switch (result.status) {
    case "animated":
      return result.videoSource === "mock" ? "הונפש (סרטון לדוגמה)" : "הונפש";
    case "refused":
      return "שירות הווידאו סירב להנפיש את האיור (מסנן בטיחות). אפשר להחליף את האיור או לוותר על ההנפשה בעמוד הזה.";
    case "failed":
      return "נכשל";
    default:
      return result.reason ? SKIP_LABELS[result.reason] : "דולג";
  }
}

function resultTone(result: PageAnimationResult): string {
  if (result.status === "failed" || result.status === "refused") return "text-danger";
  if (result.status === "animated") return "text-success";
  return "text-muted";
}

/** "הנפשת איורים": cost estimate, confirmation, per-page progress, and removal of the clips. */
export function AnimationPanel({ bookId, title, estimate: initial, licenseRefusal, animatedPages, canRun }: AnimationPanelProps) {
  const router = useRouter();
  const [estimate, setEstimate] = useState(initial);
  const [force, setForce] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<PageAnimationResult[]>([]);
  const [summary, setSummary] = useState<BookAnimationSummary | null>(null);
  // A fresh server estimate (after router.refresh()) replaces the local one.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setEstimate(initial);
    setForce(false);
  }

  const providerMock = estimate?.providerMock ?? true;
  const pagesToAnimate = estimate?.pagesToAnimate ?? 0;

  async function changeForce(next: boolean) {
    setForce(next);
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`${adminApi.bookAnimate(bookId)}${next ? "?force=1" : ""}`, {
        credentials: "same-origin",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error();
      setEstimate(payload as BookAnimationSummary);
    } catch {
      setError("לא הצלחנו לחשב את העלות המשוערת. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setConfirmOpen(false);
    setRunning(true);
    setError(null);
    setResults([]);
    setSummary(null);
    setProgress(null);
    try {
      const response = await fetch(adminApi.bookAnimate(bookId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
        credentials: "same-origin",
      });
      if (!response.ok || !response.body) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "הנפשת האיורים נכשלה. נסו שוב בעוד רגע.";
        setError(message);
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += value;
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AnimationEvent;
          if (event.type === "start") setProgress({ done: 0, total: event.total });
          else if (event.type === "page") {
            setProgress({ done: event.done, total: event.total });
            setResults((previous) => [...previous, event.result]);
          } else if (event.type === "done") setSummary(event.summary);
          else if (event.type === "error") setError(event.error);
        }
        if (done) break;
      }
    } catch {
      setError("החיבור לשרת נקטע. העמודים שכבר הונפשו נשמרו; אפשר להפעיל שוב כדי להמשיך.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await adminRequest<BookAnimationRemoval>(adminApi.bookAnimate(bookId), "DELETE");
    setBusy(false);
    setRemoveOpen(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResults([]);
    setSummary(null);
    router.refresh();
  }

  const costLine = providerMock
    ? `${pagesToAnimate} עמודים יקבלו סרטון לדוגמה, בלי עלות.`
    : `${pagesToAnimate} עמודים יונפשו. עלות משוערת: ${usd(estimate?.estimatedCostUsd ?? 0)}.`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        כל איור הופך לסרטון קצר ושקט שמתנגן בלולאה בנגן הקריאה. האיור המקורי נשאר לתצוגה המודפסת ולמי שביקש פחות תנועה.
      </p>
      {licenseRefusal ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
          {licenseRefusal}
        </p>
      ) : (
        <>
          {providerMock ? <MockNotice>{MOCK_VIDEO_MESSAGE}</MockNotice> : null}
          {estimate ? <p className="font-medium">{costLine}</p> : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={force}
              disabled={busy || running || !canRun}
              onChange={(event) => changeForce(event.target.checked)}
              className="size-4"
            />
            ליצור מחדש גם עמודים שכבר הונפשו
          </label>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {!licenseRefusal && canRun ? (
          <Button
            size="sm"
            variant="secondary"
            loading={running}
            disabled={busy || running || pagesToAnimate === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Clapperboard aria-hidden="true" />
            הנפשת איורים
          </Button>
        ) : null}
        {animatedPages.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || running}
            onClick={() => setRemoveOpen(true)}
            className="text-danger"
          >
            <Trash2 aria-hidden="true" />
            הסרת הנפשה
          </Button>
        ) : null}
      </div>
      {!canRun && !licenseRefusal ? (
        <p className="text-sm text-muted">רק מנהלי האתר יכולים להפעיל הנפשה, כי היא כרוכה בתשלום.</p>
      ) : null}
      {estimate && pagesToAnimate === 0 && !licenseRefusal && !running && results.length === 0 ? (
        <p className="text-sm text-muted">אין עמודים שצריך להנפיש.</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {progress ? (
        <p role="status" className="text-sm">
          {running ? `מנפישים… ${progress.done} מתוך ${progress.total} עמודים` : `הסתיים: ${progress.done} מתוך ${progress.total} עמודים`}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ol className="flex flex-col gap-1 text-sm">
          {results.map((result) => (
            <li key={result.pageIndex} className={resultTone(result)}>
              <span className="font-semibold">עמוד {result.pageIndex + 1}: </span>
              {resultLabel(result)}
            </li>
          ))}
        </ol>
      ) : null}
      {summary ? (
        <p className="text-sm">
          הונפשו {summary.animated}, דולגו {summary.skipped}
          {summary.refused > 0 ? `, נדחו ${summary.refused}` : ""}
          {summary.failed > 0 ? `, נכשלו ${summary.failed}` : ""}
          {summary.providerMock ? "." : `. עלות: ${usd(summary.estimatedCostUsd)}.`}
          {summary.quotaExceeded
            ? " המכסה של ספק הווידאו נגמרה, וההנפשה נעצרה. אפשר להפעיל שוב מאוחר יותר; עמודים שכבר הונפשו יידלגו."
            : summary.aborted
              ? " ההנפשה הופסקה לפני הסוף."
              : ""}
        </p>
      ) : null}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title="להנפיש את האיורים?"
        description={`"${title}": ${costLine}${providerMock ? "" : " כל עמוד לוקח דקה או שתיים."}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              ביטול
            </Button>
            <Button variant="secondary" onClick={run}>
              {providerMock ? "יצירת סרטונים לדוגמה" : `הנפשה (${usd(estimate?.estimatedCostUsd ?? 0)})`}
            </Button>
          </>
        }
      />

      <Dialog
        open={removeOpen}
        onClose={() => {
          if (!busy) setRemoveOpen(false);
        }}
        size="sm"
        title="להסיר את ההנפשה?"
        description={`הסרטונים של ${animatedPages.length} עמודים ב"${title}" יימחקו, ונגן הקריאה יציג שוב את האיורים. הנפשה מחדש תעלה שוב כסף.`}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoveOpen(false)}>
              ביטול
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              הסרת הנפשה
            </Button>
          </>
        }
      />
    </div>
  );
}
