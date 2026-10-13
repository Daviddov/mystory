import { cn } from "@/lib/cn";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Accessible label. Pass "" when the spinner only decorates other text. Default "טוען…". */
  label?: string;
  className?: string;
}

const SIZES = { sm: "size-4 border-2", md: "size-7 border-[3px]", lg: "size-12 border-4" };

export function Spinner({ size = "md", label = "טוען…", className }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <span className={cn("animate-spin rounded-full border-current border-e-transparent", SIZES[size])} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
