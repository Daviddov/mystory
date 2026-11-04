"use client";

import { useEffect } from "react";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import { routes } from "@/lib/routes";

/** Fallback for any page that throws while rendering. */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container-page py-16">
      <div role="alert">
        <EmptyState
          icon="🙈"
          title={t.error.title}
          description={t.error.description}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => retry()}>{t.error.retry}</Button>
              <ButtonLink href={routes.home()} variant="outline">
                {t.error.home}
              </ButtonLink>
            </div>
          }
        />
        {error.digest ? (
          <p className="mt-4 text-center text-sm text-muted">
            {t.error.supportCode}{" "}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
