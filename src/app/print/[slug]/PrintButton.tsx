"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Opens the browser's print dialog. The sheets are laid out by the print CSS of the page. */
export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-5" />
      הדפסה
    </Button>
  );
}
