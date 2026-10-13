import type { Metadata } from "next";
import { BookDashImporter } from "@/components/admin/BookDashImporter";
import { Card } from "@/components/ui";
import { BOOKDASH } from "@/lib/importers/bookdash";
import { routes } from "@/lib/routes";
import { requireAdminPage } from "../_lib/guard";
import { adminPaths } from "../_lib/paths";

export const metadata: Metadata = { title: "ייבוא ספרים חופשיים" };
export const dynamic = "force-dynamic";

const LINK = "font-semibold text-secondary underline underline-offset-4";

export default async function AdminImportPage() {
  await requireAdminPage(adminPaths.importBooks());

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby="import-title" className="flex flex-col gap-3">
        <h2 id="import-title" className="text-2xl font-bold">
          ייבוא ספרים חופשיים
        </h2>
        <p className="max-w-3xl leading-relaxed">
          <a href={BOOKDASH.publisherUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
            Book Dash
          </a>{" "}
          מפרסם ספרי ילדים ברישיון <bdi dir="ltr">{BOOKDASH.license}</bdi>, שמתיר לתרגם ולפרסם אותם עם קרדיט. כל ספר
          מיובא כטיוטה באנגלית, עם האיורים, תיאורי האיורים והקרדיט. אחרי הייבוא מתרגמים אותו בסטודיו, משלימים את הקרדיט,
          ורק אז אפשר לפרסם אותו.
        </p>
        <p className="max-w-3xl leading-relaxed text-muted">
          המאגר של Book Dash מונה את יוצרי כל ספר ברשימה אחת, בלי לציין מי כתב, אייר, עיצב וערך. הייבוא לא מנחש: השדות
          האלה נשארים ריקים והספר מסומן &quot;חסר קרדיט&quot;, עד שמשלימים אותם ידנית לפי עמוד הספר באתר Book Dash.
        </p>
        <p className="max-w-3xl leading-relaxed text-muted">
          ספרים ממקור אחר (למשל StoryWeaver) מעלים דרך{" "}
          <a href={routes.studioImport()} className={LINK}>
            ייבוא ספר בסטודיו
          </a>
          , עם הסימון &quot;ספר ברישיון Creative Commons&quot; ופרטי הקרדיט.
        </p>
      </Card>
      <BookDashImporter />
    </div>
  );
}
