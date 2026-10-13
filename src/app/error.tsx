"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container-page py-16">
      <div role="alert">
        <EmptyState
          icon="🙈"
          title="אופס, משהו השתבש"
          description="לא הצלחנו להציג את הדף. זה לא בגללכם. אפשר לנסות שוב, ואם זה לא עוזר, לחזור לדף הבית."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => retry()}>לנסות שוב</Button>
              <ButtonLink href={routes.home()} variant="outline">
                לדף הבית
              </ButtonLink>
            </div>
          }
        />
        {error.digest ? (
          <p className="mt-4 text-center text-sm text-muted">
            קוד לתמיכה:{" "}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
