import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { navFor, type NavLink } from "@/lib/nav";
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
export async function SiteFooter() {
  const { locale, t } = await getT();
  const nav = navFor(locale);
  const library: NavLink[] = [
    ...nav.main.slice(0, 3),
    { href: routes.search(), label: t.nav.search, emoji: "🔍" },
    ...nav.age,
  ];
  return (
    <footer className="site-chrome mt-16 border-t border-border bg-surface-2 print:hidden">
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-10 md:grid-cols-3 lg:grid-cols-6">
        <FooterColumn title={t.footer.library} links={library} />
        <FooterColumn title={t.footer.categories} links={nav.category} />
        <FooterColumn title={t.footer.themes} links={nav.theme} />
        <FooterColumn title={t.footer.timeAndTags} links={[...nav.time, ...nav.tag]} />
        <FooterColumn title={t.footer.creators} links={[...nav.studio, ...nav.account]} />
        {/* No admin link: the public footer is on every page search engines crawl. */}
        <FooterColumn title={t.footer.info} links={nav.info} />
      </div>
      <div className="border-t border-border">
        <p className="container-page py-4 text-sm text-muted">
          {t.site.tagline}
        </p>
      </div>
    </footer>
  );
}
