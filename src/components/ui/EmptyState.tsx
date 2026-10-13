import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** Large emoji or icon shown above the title. Default "📚". */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a <Button> or <ButtonLink>. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = "📚", title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-6xl leading-none" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      {description ? <p className="max-w-md leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
