"use client";

import { BookOpen, Check, Copy, Download, Link2, Lock, Printer, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, ButtonLink, buttonClasses, Card, Chip, Input } from "@/components/ui";
import { STUDIO_STATUS_LABELS } from "@/lib/i18n/studio";
import { PUBLISH_PANEL_MESSAGES, publishProblemText } from "@/lib/i18n/studio-panels";
import { routes } from "@/lib/routes";
import { STATUS_TONES, type PublishProblem } from "@/lib/studio/shared";
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
  const locale = useLocale();
  const t = PUBLISH_PANEL_MESSAGES[locale];
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">{t.status}</h2>
          <Chip tone={STATUS_TONES[info.status]}>{STUDIO_STATUS_LABELS[locale][info.status]}</Chip>
        </div>
        <p className="leading-relaxed">{t.statusHelp[info.status]}</p>

        {info.reviewNote ? (
          <div role="note" className="rounded-md bg-warning-soft p-4">
            <p className="font-bold">{t.reviewNote}</p>
            <p className="whitespace-pre-wrap">{info.reviewNote}</p>
          </div>
        ) : null}

        {lockedForOwner ? (
          <p className="flex items-start gap-2 rounded-md bg-surface-2 p-4">
            <Lock aria-hidden="true" className="mt-1 size-5 shrink-0" />
            {info.status === "pending" ? t.lockedPending : t.lockedPublished}
          </p>
        ) : null}

        {info.status !== "published" ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold">{t.readyTitle}</h3>
            {ready ? (
              <p className="flex items-center gap-2 font-medium text-success">
                <Check aria-hidden="true" className="size-5" />
                {t.ready}
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
                        {publishProblemText(locale, problem)}
                      </button>
                    ) : (
                      <span>{publishProblemText(locale, problem)}</span>
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
              {t.savePrivate}
            </Button>
          ) : null}
          {info.status === "draft" || info.status === "private" ? (
            <Button onClick={() => onStatus("pending")} disabled={!ready}>
              <Send aria-hidden="true" className="size-5" />
              {t.submit}
            </Button>
          ) : null}
          {info.status === "pending" ? (
            <Button variant="outline" onClick={() => onStatus("private")}>
              {t.cancelSubmit}
            </Button>
          ) : null}
          {info.status === "published" ? (
            <Button variant="outline" onClick={() => onStatus("private")}>
              <Lock aria-hidden="true" className="size-5" />
              {t.unpublish}
            </Button>
          ) : null}
          {canPublish && info.status !== "published" ? (
            <Button variant="secondary" onClick={() => onStatus("published")} disabled={!ready}>
              {t.publishNow}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Link2 aria-hidden="true" />
            {t.shareLink}
          </h2>
          {info.shareToken ? (
            <>
              <p>{t.shareLead}</p>
              <div className="flex gap-2">
                <Input
                  className="min-w-0"
                  readOnly
                  dir="ltr"
                  aria-label={t.shareField}
                  value={shareUrl}
                  onFocus={(event) => event.target.select()}
                />
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check aria-hidden="true" className="size-5" /> : <Copy aria-hidden="true" className="size-5" />}
                  {copied ? t.copied : t.copy}
                </Button>
              </div>
              <div>
                <Button variant="ghost" size="sm" onClick={onRemoveShare}>
                  {t.removeShare}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>{t.shareInvite}</p>
              <div>
                <Button variant="secondary" onClick={onCreateShare}>
                  <Link2 aria-hidden="true" className="size-5" />
                  {t.createShare}
                </Button>
              </div>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{t.moreActions}</h2>
          <div className="flex flex-wrap gap-2">
            <ButtonLink variant="outline" href={routes.read(info.slug)} target="_blank" rel="noopener">
              <BookOpen aria-hidden="true" className="size-5" />
              {t.openReader}
            </ButtonLink>
            <ButtonLink variant="outline" href={routes.print(info.slug)} target="_blank" rel="noopener">
              <Printer aria-hidden="true" className="size-5" />
              {t.print}
            </ButtonLink>
            {/* A plain link: the route answers with a file download, not a page. */}
            <a href={routes.exportBook(info.id)} download className={buttonClasses({ variant: "outline" })}>
              <Download aria-hidden="true" className="size-5" />
              {t.exportZip}
            </a>
            <Button variant="outline" onClick={onDelete} disabled={lockedForOwner} className="text-danger">
              <Trash2 aria-hidden="true" className="size-5" />
              {t.deleteBook}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
