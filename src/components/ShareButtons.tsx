"use client";

import { Check, Link2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ShareButtonsProps {
  /** Absolute address of the book page. */
  url: string;
  title: string;
  className?: string;
}

/** Share a book: the device's share sheet when there is one, plus WhatsApp, Telegram, email and copy-link. */
export function ShareButtons({ url, title, className }: ShareButtonsProps) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const text = `${title} – סיפור לילדים באתר הסיפור שלי`;
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
      window.prompt("העתיקו את הקישור:", url);
    }
  }

  const external = { target: "_blank", rel: "noopener noreferrer" } as const;

  return (
    <div role="group" aria-label={`שיתוף הספר ${title}`} className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-base font-semibold text-muted">שיתוף:</span>
      {canShare ? (
        <Button variant="outline" onClick={nativeShare}>
          <Share2 aria-hidden="true" className="size-5" />
          שתפו
        </Button>
      ) : null}
      <ButtonLink variant="outline" href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`} {...external}>
        <MessageCircle aria-hidden="true" className="size-5" />
        וואטסאפ
      </ButtonLink>
      <ButtonLink variant="outline" href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} {...external}>
        <Send aria-hidden="true" className="size-5" />
        טלגרם
      </ButtonLink>
      <ButtonLink variant="outline" href={`mailto:?subject=${encodedText}&body=${encodedUrl}`}>
        <Mail aria-hidden="true" className="size-5" />
        מייל
      </ButtonLink>
      <Button variant="outline" onClick={copyLink}>
        {copied ? <Check aria-hidden="true" className="size-5" /> : <Link2 aria-hidden="true" className="size-5" />}
        {copied ? "הקישור הועתק" : "העתקת קישור"}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "הקישור הועתק" : ""}
      </span>
    </div>
  );
}
