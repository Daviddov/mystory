"use client";

import { Printer } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui";
import { READER_MESSAGES } from "@/lib/i18n/reader";

/** Opens the browser's print dialog. The sheets are laid out by the print CSS of the page. */
export function PrintButton() {
  const t = READER_MESSAGES[useLocale()].print;
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-5" />
      {t.print}
    </Button>
  );
}
