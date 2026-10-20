"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Textarea } from "@/components/ui";
import type { CommentView } from "@/lib/comments";
import { cn } from "@/lib/cn";
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

const dateFormat = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

/**
 * Readers' comments on a book. Everyone who may see the book reads them;
 * signed-in readers write, and delete their own (editors and admins any).
 * Comments are rendered as plain text.
 */
export function BookComments({ bookId, initialComments, signedIn, loginHref, shareToken, className }: BookCommentsProps) {
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
        throw new Error(response.status === 429 && data?.error ? data.error : "לא הצלחנו לשמור את התגובה. נסו שוב.");
      }
      const { comment } = (await response.json()) as { comment: CommentView };
      setComments((list) => [comment, ...list]);
      setDraft("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "לא הצלחנו לשמור את התגובה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (deleting) return;
    if (!window.confirm("למחוק את התגובה?")) return;
    setDeleting(id);
    setProblem(null);
    try {
      const response = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(String(response.status));
      setComments((list) => list.filter((c) => c.id !== id));
    } catch {
      setProblem("לא הצלחנו למחוק את התגובה. נסו שוב.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section aria-labelledby="book-comments-title" className={cn("flex flex-col gap-5", className)} data-testid="book-comments">
      <h2 id="book-comments-title" className="text-2xl font-bold sm:text-3xl">
        תגובות על הספר
        {comments.length ? <span className="text-lg font-normal text-muted"> ({comments.length})</span> : null}
      </h2>

      {signedIn ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor="book-comment-body" className="text-base font-semibold">
            מה חשבתם על הספר?
          </label>
          <Textarea
            id="book-comment-body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            placeholder="כתבו תגובה…"
            aria-describedby="book-comment-hint"
            disabled={busy}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="book-comment-hint" className="text-sm text-muted">
              התגובה תוצג לכל הקוראים עם השם שלכם. {draft.length}/{COMMENT_MAX_LENGTH}
            </p>
            <Button type="submit" loading={busy} disabled={!trimmed}>
              פרסום תגובה
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-base">
          <Link href={loginHref} className="font-semibold text-secondary underline underline-offset-4">
            התחברו כדי להגיב
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
                  <span className="font-semibold">{comment.authorName}</span>
                  <span className="text-muted"> · </span>
                  <time dateTime={comment.createdAt} className="text-muted">
                    {dateFormat.format(new Date(comment.createdAt))}
                  </time>
                </p>
                {comment.canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`מחיקת התגובה של ${comment.authorName}`}
                    loading={deleting === comment.id}
                    onClick={() => void remove(comment.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </Button>
                ) : null}
              </div>
              <p className="whitespace-pre-line break-words text-lg leading-relaxed">{comment.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted">עוד אין תגובות. {signedIn ? "היו הראשונים להגיב!" : ""}</p>
      )}
    </section>
  );
}
