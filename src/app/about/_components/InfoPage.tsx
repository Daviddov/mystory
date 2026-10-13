/** Shared layout of the information pages: about, FAQ, privacy policy and terms. */
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { INFO_NAV } from "@/lib/nav";

export interface InfoPageProps {
  title: string;
  /** One or two sentences under the title. */
  lead?: ReactNode;
  /** Shown between the lead and the content, e.g. <DraftNotice />. */
  notice?: ReactNode;
  /** Path of this page, to mark it in the list of information pages. */
  current: string;
  children: ReactNode;
}

export function InfoPage({ title, lead, notice, current, children }: InfoPageProps) {
  return (
    <main className="container-page py-10">
      <article className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          {lead ? <p className="text-xl leading-relaxed text-muted">{lead}</p> : null}
        </header>
        {notice}
        {children}
      </article>

      <nav aria-label="עוד מידע על האתר" className="mx-auto mt-12 max-w-3xl border-t border-border pt-6">
        <h2 className="mb-3 text-lg font-bold">עוד מידע על האתר</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {INFO_NAV.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={link.href === current ? "page" : undefined}
                className="inline-flex min-h-11 items-center font-medium text-secondary underline underline-offset-4 hover:text-secondary-hover aria-[current=page]:text-foreground aria-[current=page]:no-underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

/** A titled block of prose. Paragraphs and lists inside get reading-friendly spacing. */
export function InfoSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={id ? `${id}-title` : undefined} className="text-2xl font-bold leading-snug">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-lg leading-relaxed [&_a]:font-medium [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4 [&_li]:ms-6 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </section>
  );
}

/** Marks a legal text as a draft that has not been reviewed by a lawyer. */
export function DraftNotice({ updated }: { updated: string }) {
  return (
    <aside
      role="note"
      aria-label="טיוטה"
      className="flex items-start gap-3 rounded-md border-2 border-warning bg-warning-soft px-5 py-4 text-foreground"
    >
      <TriangleAlert aria-hidden="true" className="mt-1 size-6 shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold">טיוטה. המסמך עדיין לא עבר בדיקה משפטית.</p>
        <p className="leading-relaxed">
          הטקסט מתאר איך האתר אמור לפעול ומה אנחנו מתכוונים להתחייב אליו. הוא אינו מסמך משפטי מחייב ואינו ייעוץ משפטי,
          ויש לבדוק אותו עם עורך דין לפני פתיחת ההרשמה לציבור.
        </p>
        <p className="text-sm text-muted">עדכון אחרון של הטיוטה: {updated}</p>
      </div>
    </aside>
  );
}

/** A detail that is still missing from a draft, shown so nobody mistakes it for final text. */
export function Missing({ children }: { children: ReactNode }) {
  return <mark className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-foreground">[חסר: {children}]</mark>;
}
