import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { NewBookForm } from "@/components/studio/NewBookForm";
import { ButtonLink, Card } from "@/components/ui";
import { requireUserPage } from "@/lib/auth";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "ספר חדש" };
export const dynamic = "force-dynamic";

export default async function NewBookPage() {
  await requireUserPage(routes.studioNew());
  return (
    <main className="container-page flex flex-col items-center gap-6 py-10">
      <Card padding="lg" className="flex w-full max-w-xl flex-col gap-6">
        <div>
          <ButtonLink variant="ghost" size="sm" href={routes.studio()}>
            <ArrowRight aria-hidden="true" className="size-4" />
            הספרים שלי
          </ButtonLink>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">ספר חדש</h1>
          <p className="mt-2 leading-relaxed text-muted">
            אחרי היצירה תוכלו לגרור את כל התמונות בבת אחת, להדביק את הסיפור ולהקליט הקראה. הספר נשאר פרטי עד שתחליטו
            אחרת.
          </p>
        </div>
        <NewBookForm />
      </Card>
    </main>
  );
}
