"use client";

import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/app/admin/_lib/paths";
import { Button, ButtonLink, Card, Chip, Spinner } from "@/components/ui";
import { CREDIT_ROLE_LABELS, type CreditRole } from "@/lib/credits";
import { routes } from "@/lib/routes";
import type { BookStatus } from "@/lib/types";
import { adminRequest } from "./request";
import { StatusChip } from "./StatusChip";

interface LocalState {
  id: string;
  slug: string;
  title: string;
  status: BookStatus;
  translated: boolean;
  missingCredits: CreditRole[];
}

interface Row {
  slug: string;
  title: string;
  description: string;
  creators: string;
  local?: LocalState;
}

interface CataloguePayload {
  rows: Row[];
  complete: boolean;
  fetchedAt: string;
}

interface ImportPayload {
  status: "created" | "skipped" | "replaced";
  warnings: string[];
  book: LocalState & { pages: number };
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: CataloguePayload };

const FALLBACK_ERROR = "לא הצלחנו לטעון את הקטלוג. נסו שוב בעוד רגע.";

async function fetchCatalogue(refresh: boolean): Promise<Load> {
  try {
    const response = await fetch(`${adminApi.importBookDash()}${refresh ? "?refresh=1" : ""}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : FALLBACK_ERROR;
      return { state: "error", message };
    }
    return { state: "ready", data: payload as CataloguePayload };
  } catch {
    return {
      state: "error",
      message: "אין חיבור לשרת. בדקו את הרשת ונסו שוב.",
    };
  }
}

/** The Book Dash catalogue with an import button per book and the state of the books already imported. */
export function BookDashImporter() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [importing, setImporting] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { kind: "error" | "info"; text: string }>>({});

  const reload = useCallback(async (refresh: boolean) => {
    setLoad({ state: "loading" });
    setLoad(await fetchCatalogue(refresh));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogue(false).then((result) => {
      if (!cancelled) setLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const importBook = async (slug: string) => {
    setImporting(slug);
    setMessages((current) => ({
      ...current,
      [slug]: { kind: "info", text: "מוריד את הטקסט והאיורים…" },
    }));
    const result = await adminRequest<ImportPayload>(adminApi.importBookDash(), "POST", { slug });
    setImporting(null);
    if (!result.ok) {
      setMessages((current) => ({
        ...current,
        [slug]: { kind: "error", text: result.error },
      }));
      return;
    }
    const { book, status, warnings } = result.data;
    const { pages, ...local } = book;
    setLoad((current) =>
      current.state === "ready"
        ? {
            ...current,
            data: {
              ...current.data,
              rows: current.data.rows.map((row) => (row.slug === slug ? { ...row, local } : row)),
            },
          }
        : current,
    );
    const notes = warnings.length > 0 ? ` הערות לבדיקה: ${warnings.length}.` : "";
    setMessages((current) => ({
      ...current,
      [slug]: {
        kind: "info",
        text:
          status === "skipped"
            ? "הספר כבר יובא קודם, ולא השתנה."
            : `הספר יובא כטיוטה באנגלית (${pages} עמודים).${notes}`,
      },
    }));
  };

  if (load.state === "loading") {
    return (
      <Card className="flex items-center justify-center py-10">
        <Spinner label="טוען את הקטלוג של Book Dash…" />
      </Card>
    );
  }
  if (load.state === "error") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p role="alert" className="font-medium text-danger">
          {load.message}
        </p>
        <Button variant="outline" onClick={() => void reload(false)}>
          <RefreshCw aria-hidden="true" className="size-5" />
          ניסיון נוסף
        </Button>
      </Card>
    );
  }

  const { rows, complete, fetchedAt } = load.data;
  const imported = rows.filter((row) => row.local).length;
  const translated = rows.filter((row) => row.local?.translated).length;

  return (
    <section aria-labelledby="bookdash-catalogue-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="bookdash-catalogue-title" className="me-auto text-2xl font-bold">
          הקטלוג של Book Dash
        </h2>
        <p className="text-muted" aria-live="polite">
          {rows.length} ספרים, {imported} יובאו, {translated} תורגמו
        </p>
        <Button variant="outline" size="sm" onClick={() => void reload(true)} disabled={importing !== null}>
          <RefreshCw aria-hidden="true" className="size-4" />
          רענון
        </Button>
      </div>
      <p className="text-sm text-muted">
        הרשימה נטענה מ-GitHub בשעה{" "}
        <time dateTime={fetchedAt}>
          {new Date(fetchedAt).toLocaleTimeString("he-IL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>{" "}
        ונשמרת לעשר דקות.
      </p>
      {!complete ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
          GitHub הגביל זמנית את רשימת התיקיות, ולכן מוצגים רק הספרים שמופיעים בקובץ הנתונים של Book Dash. נסו לרענן בעוד
          כמה דקות.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const message = messages[row.slug];
          const busy = importing === row.slug;
          return (
            <li key={row.slug}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 dir="ltr" lang="en" className="text-start text-xl font-bold">
                    {row.title}
                  </h3>
                  {row.description ? (
                    <p dir="ltr" lang="en" className="text-start text-muted">
                      {row.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted">
                    יוצרים: <bdi dir="ltr">{row.creators || "לא צוינו במאגר"}</bdi>
                  </p>
                  {row.local ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Chip tone="success">יובא</Chip>
                      <Chip tone={row.local.translated ? "success" : "warning"}>
                        {row.local.translated ? "תורגם לעברית" : "עדיין באנגלית"}
                      </Chip>
                      <StatusChip status={row.local.status} />
                      {row.local.missingCredits.length > 0 ? (
                        <Chip tone="warning">
                          חסר קרדיט: {row.local.missingCredits.map((role) => CREDIT_ROLE_LABELS[role]).join(", ")}
                        </Chip>
                      ) : null}
                    </div>
                  ) : null}
                  {message ? (
                    <p
                      role={message.kind === "error" ? "alert" : "status"}
                      className={message.kind === "error" ? "font-medium text-danger" : "text-muted"}
                    >
                      {message.text}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {row.local ? (
                    <ButtonLink href={routes.studioBook(row.local.id)} variant="outline">
                      פתיחה בסטודיו
                      <span className="sr-only">: {row.title}</span>
                    </ButtonLink>
                  ) : (
                    <Button
                      onClick={() => void importBook(row.slug)}
                      loading={busy}
                      disabled={importing !== null && !busy}
                    >
                      <Download aria-hidden="true" className="size-5" />
                      ייבוא
                      <span className="sr-only">: {row.title}</span>
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
