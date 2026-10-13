import Link from "next/link";
import {
  ACCOUNT_NAV,
  AGE_NAV,
  CATEGORY_NAV,
  INFO_NAV,
  MAIN_NAV,
  STUDIO_NAV,
  TAG_NAV,
  THEME_NAV,
  TIME_NAV,
  type NavLink,
} from "@/lib/nav";
import { routes } from "@/lib/routes";

function FooterColumn({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="flex flex-col">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex min-h-9 items-center gap-1.5 text-muted hover:text-foreground hover:underline"
            >
              {link.emoji ? <span aria-hidden="true">{link.emoji}</span> : null}
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Site footer with links to every browsing route. */
export function SiteFooter() {
  const library: NavLink[] = [
    ...MAIN_NAV.slice(0, 3),
    { href: routes.search(), label: "חיפוש", emoji: "🔍" },
    ...AGE_NAV,
  ];
  return (
    <footer className="site-chrome mt-16 border-t border-border bg-surface-2 print:hidden">
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-10 md:grid-cols-3 lg:grid-cols-6">
        <FooterColumn title="הספרייה" links={library} />
        <FooterColumn title="קטגוריות" links={CATEGORY_NAV} />
        <FooterColumn title="נושאים לשיחה" links={THEME_NAV} />
        <FooterColumn title="זמן קריאה ותגיות" links={[...TIME_NAV, ...TAG_NAV]} />
        <FooterColumn title="יוצרים ספרים" links={[...STUDIO_NAV, ...ACCOUNT_NAV]} />
        <FooterColumn title="מידע" links={[...INFO_NAV, { href: routes.admin(), label: "לוח ניהול" }]} />
      </div>
      <div className="border-t border-border">
        <p className="container-page py-4 text-sm text-muted">
          הסיפור שלי: סיפורים לילדים לקרוא ולשמוע. בלי פרסומות ובלי חלונות קופצים.
        </p>
      </div>
    </footer>
  );
}
