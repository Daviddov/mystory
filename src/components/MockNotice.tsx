"use client";

import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/locale";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { useLocale } from "./i18n/LocaleProvider";

export type MockKind = "text" | "nikud" | "tts" | "tts-device" | "image" | "video" | "login" | "translation" | "generic";

export interface MockNoticeProps {
  /** Which mocked service the notice is about. Default 'generic'. */
  kind?: MockKind;
  /** Replaces the default Hebrew message. */
  children?: ReactNode;
  /** 'inline' is a compact one-line badge. Default 'banner'. */
  variant?: "banner" | "inline";
  className?: string;
  /** Interface language of the default message. Default: the visitor's interface language. */
  locale?: Locale;
}

/** Visible notice that a result came from a mock provider. Never hide mock output from the user. */
export function MockNotice({ kind = "generic", children, variant = "banner", className, locale }: MockNoticeProps) {
  const interfaceLocale = useLocale();
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 bg-warning-soft text-foreground",
        variant === "banner" ? "rounded-md px-4 py-3 text-base" : "inline-flex rounded-full px-3 py-1 text-sm",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
      <span>{children ?? READER_MESSAGES[locale ?? interfaceLocale].mock[kind]}</span>
    </p>
  );
}
