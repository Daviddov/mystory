"use client";

import { useId } from "react";
import { costDescription, costLine, type CostContext, type CostEstimate } from "@/lib/generation/costs";

/** A muted "עלות משוערת: ..." line with a plain-Hebrew explanation (tooltip and screen-reader description). */
export function CostLine({ estimate, costs, label }: { estimate: CostEstimate; costs: CostContext; label?: string }) {
  const describedBy = useId();
  return (
    <p className="text-sm text-muted" title={costDescription(estimate)} aria-describedby={describedBy} data-testid="cost-line">
      {label ? `${label}: ` : ""}
      {costLine(estimate, costs)}
      <span id={describedBy} className="sr-only">
        {costDescription(estimate)}
      </span>
    </p>
  );
}
