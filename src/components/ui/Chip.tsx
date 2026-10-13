import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "primary" | "secondary" | "accent" | "success" | "warning" | "danger";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-foreground",
  primary: "bg-primary-soft text-foreground",
  secondary: "bg-secondary-soft text-foreground",
  accent: "bg-accent-soft text-foreground",
  success: "bg-success-soft text-foreground",
  warning: "bg-warning-soft text-foreground",
  danger: "bg-danger-soft text-foreground",
};

export interface ChipProps {
  children: ReactNode;
  /** Renders a link. */
  href?: string;
  /** Renders a toggle button (ignored when href is set). Requires a Client Component parent. */
  onClick?: () => void;
  /** Highlights the chip as the active filter. */
  selected?: boolean;
  tone?: ChipTone;
  /** 'md' is a full touch target, 'sm' a compact label. Default: 'md' when interactive, otherwise 'sm'. */
  size?: "sm" | "md";
  /** Leading emoji or icon. */
  icon?: ReactNode;
  className?: string;
  title?: string;
}

/** A pill: a static label, a link (href) or a toggle button (onClick). */
export function Chip({
  children,
  href,
  onClick,
  selected,
  tone = "neutral",
  size,
  icon,
  className,
  title,
}: ChipProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const resolvedSize = size ?? (interactive ? "md" : "sm");
  const classes = cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
    resolvedSize === "md" ? "min-h-11 px-4 text-base" : "min-h-7 px-3 text-sm",
    selected ? "bg-primary text-primary-foreground" : TONES[tone],
    interactive && "transition-[filter,transform] hover:brightness-95 active:scale-[0.97]",
    className,
  );
  const content = (
    <>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </>
  );
  if (href !== undefined) {
    return (
      <Link href={href} className={classes} aria-current={selected ? "page" : undefined} title={title}>
        {content}
      </Link>
    );
  }
  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected ?? false} className={classes} title={title}>
        {content}
      </button>
    );
  }
  return (
    <span className={classes} title={title}>
      {content}
    </span>
  );
}
