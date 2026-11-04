"use client";

import { Check, Copy, Link2, Link2Off } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { showServerMessage } from "@/lib/i18n/server-errors";
import { Button } from "@/components/ui";
import { accountMessages } from "@/lib/i18n/account";
import { routes } from "@/lib/routes";

export interface ShareControlsProps {
  bookId: string;
  title: string;
  /** The current share token of the book, when a link already exists. */
  initialToken?: string | null;
}

interface ShareResponse {
  token: string | null;
  url: string | null;
  error?: string;
}

const noopSubscribe = () => () => {};

/** The site origin, "" during server rendering (so hydration matches). */
function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

/** Create, copy and revoke the public share link of one of my books. */
export function ShareControls({ bookId, title, initialToken }: ShareControlsProps) {
  const locale = useLocale();
  const t = accountMessages(locale).share;
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = useOrigin();
  const link = token ? (url ?? `${origin}${routes.share(token)}`) : null;

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/share/${encodeURIComponent(bookId)}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? "{}" : undefined,
      });
      const body = (await response.json().catch(() => ({}))) as Partial<ShareResponse>;
      if (!response.ok) {
        setError(showServerMessage(locale, body.error, t.failed));
        return;
      }
      setToken(body.token ?? null);
      setUrl(body.url ?? null);
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t.copyFailed);
    }
  }

  const fieldId = `share-link-${bookId}`;

  return (
    <div className="flex flex-col gap-2">
      {link ? (
        <>
          <label htmlFor={fieldId} className="text-sm font-semibold text-muted">
            {t.linkLabel}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={fieldId}
              readOnly
              dir="ltr"
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-touch min-w-0 flex-1 rounded-md border-2 border-border bg-surface-2 px-3 text-start text-sm"
            />
            <Button variant="secondary" size="sm" onClick={copy} aria-label={t.copyAria(title)}>
              {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              {copied ? t.copied : t.copy}
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={busy}
              onClick={() => call("DELETE")}
              aria-label={t.revokeAria(title)}
            >
              <Link2Off aria-hidden="true" className="size-4" />
              {t.revoke}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            variant="outline"
            size="sm"
            loading={busy}
            onClick={() => call("POST")}
            aria-label={t.createAria(title)}
          >
            <Link2 aria-hidden="true" className="size-4" />
            {t.create}
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="min-h-0 text-sm">
        {error ? <span className="text-danger">{error}</span> : copied ? t.linkCopied : null}
      </p>
    </div>
  );
}
