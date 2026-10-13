import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "accent" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-card",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover shadow-card",
  accent: "bg-accent text-accent-foreground hover:brightness-95 shadow-card",
  outline: "border-2 border-border-strong bg-surface text-foreground hover:bg-surface-2",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "bg-danger text-danger-foreground hover:brightness-90 shadow-card",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-4 text-sm gap-1.5",
  md: "min-h-touch px-5 text-base gap-2",
  lg: "min-h-touch-lg px-7 text-xl gap-2.5",
  icon: "size-touch p-0",
  "icon-lg": "size-touch-lg p-0",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class string of a button. Use it to style any element like a button. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
    "transition-[background-color,filter,transform] duration-150 active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

export interface ButtonProps extends Omit<ComponentProps<"button">, "children">, ButtonStyleOptions {
  children?: ReactNode;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

/** A <button>. Defaults to type="button"; pass type="submit" inside forms. Icon-only buttons need aria-label. */
export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading,
  disabled,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : null}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, "children">, ButtonStyleOptions {
  children?: ReactNode;
}

/** A next/link styled as a button. */
export function ButtonLink({ variant, size, fullWidth, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  );
}
