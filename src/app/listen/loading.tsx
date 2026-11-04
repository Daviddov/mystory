"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Spinner } from "@/components/ui";
import { libraryMessages } from "@/lib/i18n/library";

export default function ListenLoading() {
  const t = libraryMessages(useLocale()).listen;
  return (
    <main className="container-page flex flex-col items-center gap-4 py-20 text-center">
      <Spinner size="lg" label={t.loading} />
      <p className="text-lg text-muted" aria-hidden="true">
        {t.loading}
      </p>
    </main>
  );
}
