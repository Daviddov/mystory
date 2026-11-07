"use client";

import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import type { KeyCheckResult, KeyState } from "@/lib/ai/key-check";
import { Button, Card, Chip } from "@/components/ui";
import { adminRequest } from "./request";

const STATE_LABELS: Record<KeyState, string> = {
  ok: "תקין",
  invalid: "מפתח לא תקין",
  quota: "חרגתם מהמכסה",
  error: "שגיאה",
  missing: "לא מוגדר",
};

export function KeyHealth() {
  const [results, setResults] = useState<KeyCheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const response = await adminRequest<{ results: KeyCheckResult[] }>(adminApi.health(), "POST");
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setResults(response.data.results);
  }

  return (
    <Card as="section" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <p className="flex-1 text-muted">
          כל בדיקה פונה פעם אחת לספק ומבקשת רשימת מודלים (בחינם). היא מוכיחה שהמפתח תקף, לא שנשארה מכסה למודל מסוים.
        </p>
        <Button onClick={run} disabled={busy}>
          {busy ? "בודק..." : "בדוק מפתחות"}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {results ? (
        <ul className="flex flex-col gap-2">
          {results.map((result) => (
            <li key={result.envVar} className="flex flex-wrap items-baseline gap-3 rounded-lg border border-border p-3">
              <span className="font-semibold">{result.label}</span>
              <bdi dir="ltr" className="text-sm text-muted">
                {result.envVar}
              </bdi>
              <Chip tone={result.state === "ok" ? "success" : result.state === "missing" ? "neutral" : "danger"}>
                {STATE_LABELS[result.state]}
              </Chip>
              {result.ms !== undefined ? <span className="text-sm text-muted tabular-nums">{result.ms}ms</span> : null}
              {result.detail ? (
                <bdi dir="ltr" className="basis-full text-sm text-muted">
                  {result.detail}
                </bdi>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
