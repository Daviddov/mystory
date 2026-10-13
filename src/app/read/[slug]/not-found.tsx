import { ButtonLink, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { routes } from "@/lib/routes";

/** Shown for a missing book and for a private book the visitor may not read (the two look the same on purpose). */
export default async function ReadNotFound() {
  const user = await getCurrentUser();
  return (
    <main className="container-page py-16">
      <EmptyState
        icon="🔍"
        title="לא מצאנו את הספר הזה"
        description={
          user
            ? "ייתכן שהספר הוסר, או שהוא פרטי ושייך למישהו אחר. ספר פרטי נפתח רק לבעליו או דרך קישור שיתוף."
            : "ייתכן שהספר הוסר, או שהוא ספר פרטי. אם זה ספר שלכם, התחברו ונסו שוב."
        }
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={routes.books()}>לכל הספרים</ButtonLink>
            {user ? null : (
              <ButtonLink href={routes.login()} variant="outline">
                התחברות
              </ButtonLink>
            )}
          </div>
        }
      />
    </main>
  );
}
