"use client";

import { accountMessages } from "@/lib/i18n/account";
import { useDeviceLocale } from "./useDeviceLocale";

/** Title of /offline, in the language chosen on this device (see useDeviceLocale). */
export function OfflineHeading() {
  const t = accountMessages(useDeviceLocale()).offline;
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-4xl font-extrabold">{t.title}</h1>
      <p className="text-lg text-muted">{t.intro}</p>
    </header>
  );
}
