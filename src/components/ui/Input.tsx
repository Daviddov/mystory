import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-md border-2 border-border-strong bg-surface px-4 text-base text-foreground " +
  "placeholder:text-muted/70 transition-colors focus-visible:border-ring " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "min-h-touch", className)} {...rest} />;
}

export function Textarea({ className, rows = 4, ...rest }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(CONTROL, "py-3 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL, "min-h-touch", className)} {...rest}>
      {children}
    </select>
  );
}

export function Label({ className, ...rest }: ComponentProps<"label">) {
  return <label className={cn("block text-base font-semibold text-foreground", className)} {...rest} />;
}

export interface FieldProps {
  label: ReactNode;
  /** id of the control inside; connects the label. */
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint or error. Give the control id={htmlFor}. The hint is
 * rendered with id "<htmlFor>-hint" and the error with id "<htmlFor>-error"
 * for aria-describedby.
 */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={htmlFor + "-hint"} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={htmlFor + "-error"} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
