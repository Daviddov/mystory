"use client";

import { Check, Link2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import { READER_MESSAGES } from "@/lib/i18n/reader";

export interface ShareButtonsProps {
  /** Absolute address of the book page. */
  url: string;
  title: string;
  className?: string;
}

/** Share a book: the device's share sheet when there is one, plus WhatsApp, Telegram, email and copy-link. */
export function ShareButtons({ url, title, className }: ShareButtonsProps) {
  const t = READER_MESSAGES[useLocale()].share;
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const text = t.text(title);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // The reader closed the share sheet.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t.copyPrompt, url);
    }
  }

  const external = { target: "_blank", rel: "noopener noreferrer" } as const;

  return (
    <div role="group" aria-label={t.group(title)} className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-base font-semibold text-muted">{t.label}</span>
      {canShare ? (
        <Button variant="outline" onClick={nativeShare}>
          <Share2 aria-hidden="true" className="size-5" />
          {t.share}
        </Button>
      ) : null}
      <ButtonLink variant="outline" href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`} {...external}>
        <MessageCircle aria-hidden="true" className="size-5" />
        {t.whatsapp}
      </ButtonLink>
      <ButtonLink variant="outline" href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} {...external}>
        <Send aria-hidden="true" className="size-5" />
        {t.telegram}
      </ButtonLink>
      <ButtonLink variant="outline" href={`mailto:?subject=${encodedText}&body=${encodedUrl}`}>
        <Mail aria-hidden="true" className="size-5" />
        {t.email}
      </ButtonLink>
      <Button variant="outline" onClick={copyLink}>
        {copied ? <Check aria-hidden="true" className="size-5" /> : <Link2 aria-hidden="true" className="size-5" />}
        {copied ? t.copied : t.copy}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t.copied : ""}
      </span>
    </div>
  );
}
