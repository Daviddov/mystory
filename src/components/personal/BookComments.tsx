"use client";

import Link from "@/components/i18n/LocaleLink";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { showServerMessage } from "@/lib/i18n/server-errors";
import { Button, Textarea } from "@/components/ui";
import type { CommentView } from "@/lib/comments";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/locale";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { COMMENT_MAX_LENGTH } from "@/lib/types";

export interface BookCommentsProps {
  bookId: string;
  /** Newest first, as the server rendered them. */
  initialComments: CommentView[];
  signedIn: boolean;
  /** Login page URL that returns to this book. */
  loginHref: string;
  /** Share token of a private book opened through a share link. */
  shareToken?: string;
  className?: string;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
};
const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  he: new Intl.DateTimeFormat("he-IL", DATE_OPTIONS),
  en: new Intl.DateTimeFormat("en-GB", DATE_OPTIONS),
};

/**
 * Readers' comments on a book. Everyone who may see the book reads them;
 * signed-in readers write, and delete their own (editors and admins any).
 * Comments are rendered as plain text.
 */
export function BookComments({ bookId, initialComments, signedIn, loginHref, shareToken, className }: BookCommentsProps) {
  const locale = useLocale();
  const t = READER_MESSAGES[locale].comments;
  const [comments, setComments] = useState<CommentView[]>(initialComments);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const base = `/api/comments/${encodeURIComponent(bookId)}`;
  const trimmed = draft.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !trimmed) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(shareToken ? { body: trimmed, token: shareToken } : { body: trimmed }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        // The server's rate-limit message (translated for English; this module's text if unknown).
        const tooFast = response.status === 429 && data?.error ? showServerMessage(locale, data.error, t.tooFast) : "";
        throw new Error(tooFast || t.saveFailed);
      }
      const { comment } = (await response.json()) as { comment: CommentView };
      setComments((list) => [comment, ...list]);
      setDraft("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (deleting) return;
    if (!window.confirm(t.confirmDelete)) return;
    setDeleting(id);
    setProblem(null);
    try {
      const response = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(String(response.status));
      setComments((list) => list.filter((c) => c.id !== id));
    } catch {
      setProblem(t.deleteFailed);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section aria-labelledby="book-comments-title" className={cn("flex flex-col gap-5", className)} data-testid="book-comments">
      <h2 id="book-comments-title" className="text-2xl font-bold sm:text-3xl">
        {t.title}
        {comments.length ? <span className="text-lg font-normal text-muted"> ({comments.length})</span> : null}
      </h2>

      {signedIn ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor="book-comment-body" className="text-base font-semibold">
            {t.prompt}
          </label>
          <Textarea
            id="book-comment-body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            placeholder={t.placeholder}
            aria-describedby="book-comment-hint"
            disabled={busy}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="book-comment-hint" className="text-sm text-muted">
              {t.hint} {draft.length}/{COMMENT_MAX_LENGTH}
            </p>
            <Button type="submit" loading={busy} disabled={!trimmed}>
              {t.post}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-base">
          <Link href={loginHref} className="font-semibold text-secondary underline underline-offset-4">
            {t.signIn}
          </Link>
        </p>
      )}

      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}

      {comments.length ? (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">
                  <bdi className="font-semibold">{comment.authorName}</bdi>
                  <span className="text-muted"> · </span>
                  <time dateTime={comment.createdAt} className="text-muted">
                    {DATE_FORMATS[locale].format(new Date(comment.createdAt))}
                  </time>
                </p>
                {comment.canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.deleteOf(comment.authorName)}
                    loading={deleting === comment.id}
                    onClick={() => void remove(comment.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </Button>
                ) : null}
              </div>
              <p dir="auto" className="whitespace-pre-line break-words text-lg leading-relaxed">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted">
          {t.none} {signedIn ? t.beFirst : ""}
        </p>
      )}
    </section>
  );
}
