import type { Metadata } from "next";
import { ButtonLink, EmptyState } from "@/components/ui";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "הדף לא נמצא",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="container-page py-16">
      <h1 className="sr-only">הדף לא נמצא</h1>
      <EmptyState
        icon="🧭"
        title="הדף הזה הלך לאיבוד"
        description="לא מצאנו את מה שחיפשתם. אולי הספר עבר למדף אחר, ואולי נפלה טעות בכתובת."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={routes.home()}>חזרה לדף הבית</ButtonLink>
            <ButtonLink href={routes.books()} variant="outline">
              לכל הספרים
            </ButtonLink>
            <ButtonLink href={routes.search()} variant="outline">
              חיפוש ספר
            </ButtonLink>
          </div>
        }
      />
    </main>
  );
}
