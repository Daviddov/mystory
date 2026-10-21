"use client";

import { CloudUpload } from "lucide-react";
import { useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { Button } from "@/components/ui";
import type { BookPushPlan } from "@/lib/sync/push-book";
import { adminRequest } from "./request";

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  pending: "ממתין לאישור",
  published: "מאושר לפרסום",
  rejected: "נדחה",
  private: "פרטי",
};

/** Local dev only: compare this book with Supabase, then push it after the editor confirms. */
export function PushToSupabasePanel({ bookId }: { bookId: string }) {
  const [plan, setPlan] = useState<BookPushPlan | null>(null);
  const [busy, setBusy] = useState<"check" | "push" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy("check");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(adminApi.bookPush(bookId), { credentials: "same-origin" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const text = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "";
        throw new Error(text || "הבדיקה נכשלה");
      }
      setPlan(payload as BookPushPlan);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "הבדיקה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  async function push() {
    setBusy("push");
    setError(null);
    const result = await adminRequest(adminApi.bookPush(bookId), "POST");
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlan(null);
    setMessage("הספר עודכן ב-Supabase.");
  }

  const nothingToDo = plan && plan.action === "same" && !plan.upload.length && !plan.remove.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        השוואה בין הספר המקומי לבין Supabase. שום דבר לא ישתנה עד שתאשרו.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={check} disabled={busy !== null}>
          <CloudUpload aria-hidden className="size-4" />
          {busy === "check" ? "בודק…" : "בדיקת שינויים מול Supabase"}
        </Button>
      </div>

      {plan && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
          <div>
            סטטוס מקומי: <strong>{STATUS_LABELS[plan.status] ?? plan.status}</strong>
          </div>
          {nothingToDo ? (
            <div>הספר ב-Supabase כבר זהה למקומי.</div>
          ) : (
            <ul className="list-disc ps-5">
              {plan.action === "create" && <li>הספר עדיין לא קיים ב-Supabase ויווצר.</li>}
              {plan.action === "update" && plan.fields.length > 0 && <li>שדות שיתעדכנו: {plan.fields.join(", ")}</li>}
              {plan.action === "update" && plan.pages.length > 0 && <li>עמודים שיתעדכנו: {plan.pages.join(", ")}</li>}
              {plan.upload.length > 0 && <li>{plan.upload.length} קבצי מדיה יועלו.</li>}
              {plan.remove.length > 0 && <li>{plan.remove.length} קבצי מדיה ישנים יימחקו מ-Supabase.</li>}
            </ul>
          )}
          {plan.remoteIsNewer && (
            <div className="font-semibold text-danger">
              שימו לב: הספר ב-Supabase עודכן אחרי הגרסה המקומית. העלאה תדרוס את השינויים האלה.
            </div>
          )}
          {!nothingToDo && (
            <div>
              <Button size="sm" onClick={push} disabled={busy !== null}>
                {busy === "push" ? "מעלה…" : "אישור ועדכון ב-Supabase"}
              </Button>
            </div>
          )}
        </div>
      )}

      {message && <p role="status" className="text-sm font-semibold">{message}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
