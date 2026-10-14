"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminPaths } from "@/app/admin/_lib/paths";
import { cn } from "@/lib/cn";

export interface AdminNavProps {
  pendingCount: number;
  /** The users tab is shown to admins only (the page and API enforce it on the server). */
  showUsers: boolean;
}

export function AdminNav({ pendingCount, showUsers }: AdminNavProps) {
  const pathname = usePathname();
  const items: {
    href: string;
    label: string;
    exact?: boolean;
    badge?: number;
  }[] = [
    { href: adminPaths.home(), label: "סקירה", exact: true },
    { href: adminPaths.queue(), label: "תור אישורים", badge: pendingCount },
    { href: adminPaths.pipeline(), label: "מסלול פרסום" },
    { href: adminPaths.books(), label: "כל הספרים" },
    { href: adminPaths.collections(), label: "אוספים וספר השבוע" },
    { href: adminPaths.taxonomy(), label: "תגיות ונושאים" },
    { href: adminPaths.importBooks(), label: "ייבוא ספרים חופשיים" },
    ...(showUsers ? [{ href: adminPaths.users(), label: "משתמשים" }] : []),
  ];
  return (
    <nav aria-label="ניווט בלוח הניהול" className="scrollbar-none -mx-1 overflow-x-auto">
      <ul className="flex gap-2 px-1 py-1">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 font-semibold",
                  active ? "bg-primary text-primary-foreground" : "bg-surface-2 hover:brightness-95",
                )}
              >
                {item.label}
                {item.badge ? (
                  <span
                    className={cn(
                      "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-sm font-bold",
                      active ? "bg-primary-foreground text-primary" : "bg-warning-soft text-foreground",
                    )}
                  >
                    <span className="sr-only">ממתינים: </span>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
