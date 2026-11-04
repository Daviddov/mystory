import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { cn } from "@/lib/cn";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { routes } from "@/lib/routes";
import { breadcrumbJsonLd } from "@/lib/seo";

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeadingProps {
  title: ReactNode;
  emoji?: string;
  /** Small line above the title, e.g. "קטגוריה". */
  eyebrow?: string;
  description?: ReactNode;
  /** Trail after "דף הבית". The last crumb is the current page. */
  crumbs?: Crumb[];
  /** Also emit the crumbs as BreadcrumbList structured data. Off for pages search engines must not see (private books). */
  structuredData?: boolean;
  children?: ReactNode;
  /** Interface language of the labels. Default Hebrew. */
  locale?: Locale;
  className?: string;
}

/** Breadcrumbs (visible and as BreadcrumbList structured data) + h1 + description shared by every library page. */
export function PageHeading({
  title,
  emoji,
  eyebrow,
  description,
  crumbs,
  structuredData = true,
  children,
  locale = DEFAULT_LOCALE,
  className,
}: PageHeadingProps) {
  const t = getMessages(locale);
  const trail: Crumb[] = [{ label: t.nav.home, href: routes.home() }, ...(crumbs ?? [])];
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {crumbs && structuredData ? <JsonLd data={breadcrumbJsonLd(crumbs)} /> : null}
      {crumbs ? (
        <nav aria-label={t.library.breadcrumbs}>
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
            {trail.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 ? <ChevronLeft aria-hidden="true" className="size-4 ltr:-scale-x-100" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="rounded-sm py-2 underline-offset-4 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="py-2 font-semibold text-foreground">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {eyebrow ? <p className="text-base font-semibold text-secondary">{eyebrow}</p> : null}
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
        {emoji ? <span aria-hidden="true">{emoji} </span> : null}
        {title}
      </h1>
      {description ? <p className="max-w-2xl text-lg leading-relaxed text-muted">{description}</p> : null}
      {children}
    </header>
  );
}
