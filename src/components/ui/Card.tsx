import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends ComponentProps<"div"> {
  /** Element to render, e.g. "section", "article", "li". Default "div". */
  as?: ElementType;
  /** 'none' when the content (such as a cover image) should reach the edges. Default 'md'. */
  padding?: "none" | "sm" | "md" | "lg";
  /** 'soft' uses the tinted surface without a shadow. Default 'raised'. */
  tone?: "raised" | "soft" | "outline";
}

const PADDING = { none: "", sm: "p-3", md: "p-5", lg: "p-7" };
const TONE = {
  raised: "bg-surface shadow-card border border-border",
  soft: "bg-surface-2",
  outline: "border-2 border-border bg-transparent",
};

export function Card({ as: Tag = "div", padding = "md", tone = "raised", className, ...rest }: CardProps) {
  return <Tag className={cn("rounded-lg text-foreground", TONE[tone], PADDING[padding], className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: ComponentProps<"h3">) {
  return <h3 className={cn("text-xl font-bold leading-snug", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("leading-relaxed text-muted", className)} {...rest} />;
}
