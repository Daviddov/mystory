"use client";

import { BookOpen, Check, Copy, Download, Link2, Lock, Printer, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink, buttonClasses, Card, Chip, Input } from "@/components/ui";
import { routes } from "@/lib/routes";
import { STATUS_LABELS, STATUS_TONES, type PublishProblem } from "@/lib/studio/shared";
import type { BookStatus } from "@/lib/types";
import type { ServerInfo } from "./types";

export interface PublishPanelProps {
  info: ServerInfo;
  /** What still blocks a submission, computed from the current editor state. */
  problems: PublishProblem[];
  /** Editors and admins may publish directly. */
  canPublish: boolean;
  onStatus: (status: BookStatus) => void;
  onCreateShare: () => void;
  onRemoveShare: () => void;
  onDelete: () => void;
  onGoToPage: (pageIndex: number) => void;
}

const STATUS_HELP: Record<BookStatus, string> = {
  draft: "הספר בעבודה. רק אתם רואים אותו.",
  private: "הספר פרטי. רק אתם רואים אותו, ומי שקיבל מכם קישור שיתוף.",
  pending: "הספר הוגש לפרסום וממתין לאישור של עורך. עד אז הוא נשאר פרטי.",
  published: "הספר מפורסם בספרייה, וכל אחד יכול לקרוא אותו.",
};

/** Privacy, share link, submission for publication and deletion. */
export function PublishPanel({
  info,
  problems,
  canPublish,
  onStatus,
  onCreateShare,
  onRemoveShare,
  onDelete,
  onGoToPage,
}: PublishPanelProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    info.shareToken && typeof window !== "undefined"
      ? new URL(routes.share(info.shareToken), window.location.origin).toString()
      : "";
  const ready = problems.length === 0;
  const lockedForOwner = (info.status === "published" || info.status === "pending") && !canPublish;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access was refused: the link stays selectable in the field.
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">מצב הספר</h2>
          <Chip tone={STATUS_TONES[info.status]}>{STATUS_LABELS[info.status]}</Chip>
        </div>
        <p className="leading-relaxed">{STATUS_HELP[info.status]}</p>

        {info.reviewNote ? (
          <div role="note" className="rounded-md bg-warning-soft p-4">
            <p className="font-bold">הערת העורך:</p>
            <p className="whitespace-pre-wrap">{info.reviewNote}</p>
          </div>
        ) : null}

        {lockedForOwner ? (
          <p className="flex items-start gap-2 rounded-md bg-surface-2 p-4">
            <Lock aria-hidden="true" className="mt-1 size-5 shrink-0" />
            {info.status === "pending"
              ? "ספר שהוגש לפרסום נעול לעריכה עד שעורך יעבור עליו. כדי לערוך אותו צריך לבטל את ההגשה, ואז להגיש אותו שוב."
              : "ספר שפורסם נעול לעריכה. כדי לערוך אותו צריך להחזיר אותו למצב פרטי, ואז להגיש אותו שוב לאישור."}
          </p>
        ) : null}

        {info.status !== "published" ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold">מוכן להגשה?</h3>
            {ready ? (
              <p className="flex items-center gap-2 font-medium text-success">
                <Check aria-hidden="true" className="size-5" />
                הכול מוכן. אפשר להגיש את הספר לפרסום.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {problems.map((problem, index) => (
                  <li key={`${problem.code}-${index}`} className="flex items-start gap-2">
                    <span aria-hidden="true" className="text-warning">
                      ●
                    </span>
                    {problem.pageIndex !== undefined ? (
                      <button
                        type="button"
                        className="text-start underline"
                        onClick={() => onGoToPage(problem.pageIndex as number)}
                      >
                        {problem.message}
                      </button>
                    ) : (
                      <span>{problem.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {info.status === "draft" ? (
            <Button variant="outline" onClick={() => onStatus("private")}>
              <Lock aria-hidden="true" className="size-5" />
              שמירה כספר פרטי
            </Button>
          ) : null}
          {info.status === "draft" || info.status === "private" ? (
            <Button onClick={() => onStatus("pending")} disabled={!ready}>
              <Send aria-hidden="true" className="size-5" />
              הגשה לפרסום בספרייה
            </Button>
          ) : null}
          {info.status === "pending" ? (
            <Button variant="outline" onClick={() => onStatus("private")}>
              ביטול ההגשה והשארה כפרטי
            </Button>
          ) : null}
          {info.status === "published" ? (
            <Button variant="outline" onClick={() => onStatus("private")}>
              <Lock aria-hidden="true" className="size-5" />
              הסרה מהספרייה והחזרה לפרטי
            </Button>
          ) : null}
          {canPublish && info.status !== "published" ? (
            <Button variant="secondary" onClick={() => onStatus("published")} disabled={!ready}>
              פרסום עכשיו (עורכים)
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Link2 aria-hidden="true" />
            קישור שיתוף
          </h2>
          {info.shareToken ? (
            <>
              <p>כל מי שמקבל את הקישור יכול לקרוא את הספר, גם בלי להתחבר.</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  dir="ltr"
                  aria-label="קישור השיתוף"
                  value={shareUrl}
                  onFocus={(event) => event.target.select()}
                />
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check aria-hidden="true" className="size-5" /> : <Copy aria-hidden="true" className="size-5" />}
                  {copied ? "הועתק" : "העתקה"}
                </Button>
              </div>
              <div>
                <Button variant="ghost" size="sm" onClick={onRemoveShare}>
                  ביטול הקישור
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>אפשר לשלוח את הספר לסבא וסבתא או לחברים בלי לפרסם אותו בספרייה.</p>
              <div>
                <Button variant="secondary" onClick={onCreateShare}>
                  <Link2 aria-hidden="true" className="size-5" />
                  יצירת קישור שיתוף
                </Button>
              </div>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">עוד פעולות</h2>
          <div className="flex flex-wrap gap-2">
            <ButtonLink variant="outline" href={routes.read(info.slug)} target="_blank" rel="noopener">
              <BookOpen aria-hidden="true" className="size-5" />
              פתיחה בנגן הקריאה
            </ButtonLink>
            <ButtonLink variant="outline" href={routes.print(info.slug)} target="_blank" rel="noopener">
              <Printer aria-hidden="true" className="size-5" />
              הדפסה ו-PDF
            </ButtonLink>
            {/* A plain link: the route answers with a file download, not a page. */}
            <a href={routes.exportBook(info.id)} download className={buttonClasses({ variant: "outline" })}>
              <Download aria-hidden="true" className="size-5" />
              ייצוא לקובץ zip
            </a>
            <Button variant="outline" onClick={onDelete} disabled={lockedForOwner} className="text-danger">
              <Trash2 aria-hidden="true" className="size-5" />
              מחיקת הספר
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
