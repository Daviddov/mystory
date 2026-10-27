import Link from "next/link";
import { LogIn, LogOut, Menu, Search, Shield, UserRound } from "lucide-react";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { ACCOUNT_NAV, AGE_NAV, MAIN_NAV } from "@/lib/nav";
import { routes } from "@/lib/routes";
import { ThemeToggle } from "../ThemeToggle";
import { HeaderMenu } from "./HeaderMenu";

const ICON_LINK =
  "inline-flex size-touch shrink-0 items-center justify-center rounded-full text-foreground hover:bg-surface-2";
const MENU_LINK = "flex min-h-touch items-center gap-2 rounded-md px-3 text-lg font-medium hover:bg-surface-2";

/** Sticky site header: logo, main navigation, search, theme toggle and the account menu. */
export async function SiteHeader() {
  const user = await getCurrentUser();
  const isEditor = hasRole(user, "editor");

  return (
    <header className="site-chrome sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur print:hidden">
      <div className="container-page flex min-h-16 items-center gap-1 sm:gap-2">
        <Link
          href={routes.home()}
          className="group flex min-h-touch min-w-0 items-center gap-1.5 rounded-full pe-1 font-display text-xl font-bold text-primary sm:shrink-0 sm:gap-2 sm:pe-2 sm:text-2xl"
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-xl shadow-card transition-transform duration-300 group-hover:-rotate-6 sm:size-10 sm:text-2xl"
          >
            📖
          </span>
          <span className="truncate">הסיפור שלי</span>
        </Link>

        <nav aria-label="ניווט ראשי" className="ms-4 hidden items-center gap-1 lg:flex">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-full px-3.5 font-semibold transition-colors hover:bg-primary-soft hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex shrink-0 items-center sm:gap-1">
          <Link href={routes.search()} className={ICON_LINK} aria-label="חיפוש" title="חיפוש">
            <Search aria-hidden="true" />
          </Link>
          <ThemeToggle />

          {user ? (
            <HeaderMenu
              className="relative hidden lg:block"
              summaryClassName="flex min-h-touch list-none items-center gap-2 rounded-full px-3 font-semibold hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
              summaryLabel={`החשבון של ${user.name}`}
              summary={
                <>
                  <UserRound aria-hidden="true" />
                  <span className="max-w-32 truncate">{user.name}</span>
                </>
              }
            >
              <div className="absolute end-0 top-full z-50 mt-2 flex w-60 flex-col rounded-lg border border-border bg-surface p-2 shadow-pop">
                {ACCOUNT_NAV.map((item) => (
                  <Link key={item.href} href={item.href} className={MENU_LINK}>
                    {item.label}
                  </Link>
                ))}
                {isEditor ? (
                  <Link href={routes.admin()} className={MENU_LINK}>
                    <Shield aria-hidden="true" className="size-5" />
                    לוח ניהול
                  </Link>
                ) : null}
                <form action={logoutAction}>
                  <button type="submit" className={`${MENU_LINK} w-full`}>
                    <LogOut aria-hidden="true" className="size-5" />
                    יציאה
                  </button>
                </form>
              </div>
            </HeaderMenu>
          ) : (
            <Link
              href={routes.login()}
              className="hidden min-h-touch items-center gap-2 rounded-full px-4 font-semibold hover:bg-surface-2 lg:inline-flex"
            >
              <LogIn aria-hidden="true" />
              כניסה
            </Link>
          )}

          <HeaderMenu
            className="lg:hidden"
            summaryClassName={`${ICON_LINK} list-none [&::-webkit-details-marker]:hidden`}
            summaryLabel="תפריט"
            summary={<Menu aria-hidden="true" />}
          >
            <nav
              aria-label="תפריט"
              className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-surface p-3 shadow-pop"
            >
              <ul className="container-page flex flex-col px-0">
                {MAIN_NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={MENU_LINK}>
                      <span aria-hidden="true">{item.emoji}</span>
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li className="my-2 border-t border-border" aria-hidden="true" />
                {AGE_NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={MENU_LINK}>
                      <span aria-hidden="true">{item.emoji}</span>
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li className="my-2 border-t border-border" aria-hidden="true" />
                {user ? (
                  <>
                    {ACCOUNT_NAV.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className={MENU_LINK}>
                          {item.label}
                        </Link>
                      </li>
                    ))}
                    {isEditor ? (
                      <li>
                        <Link href={routes.admin()} className={MENU_LINK}>
                          <Shield aria-hidden="true" className="size-5" />
                          לוח ניהול
                        </Link>
                      </li>
                    ) : null}
                    <li>
                      <form action={logoutAction}>
                        <button type="submit" className={`${MENU_LINK} w-full`}>
                          <LogOut aria-hidden="true" className="size-5" />
                          יציאה ({user.name})
                        </button>
                      </form>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link href={routes.login()} className={MENU_LINK}>
                      <LogIn aria-hidden="true" className="size-5" />
                      כניסה
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </HeaderMenu>
        </div>
      </div>
    </header>
  );
}
