"use client";

import { Download, Share, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountMessages, type AccountMessages } from "@/lib/i18n/account";

/** Chromium's install event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "mystory:install-dismissed";
const VISITS_KEY = "mystory:visits";
const VISIT_FLAG = "mystory:visit-counted";
const DISMISS_DAYS = 30;
/** The banner waits for a returning visitor; first-time readers are left alone. */
const MIN_VISITS = 2;
/** Reading and listening pages are never interrupted. */
const QUIET_PREFIXES = ["/read", "/print", "/listen", "/offline/read", "/login", "/studio", "/create"];

interface InstallState {
  /** The browser offered an install prompt we can trigger. */
  canPrompt: boolean;
  /** iPhone / iPad Safari: installing is manual (Share -> Add to Home Screen). */
  ios: boolean;
  standalone: boolean;
  dismissed: boolean;
  visits: number;
}

const SERVER_STATE: InstallState = { canPrompt: false, ios: false, standalone: false, dismissed: true, visits: 0 };

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function safeGet(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: "local" | "session", key: string, value: string): void {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // storage blocked: nothing to remember
  }
}

function update(patch: Partial<InstallState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  let visits = Number(safeGet("local", VISITS_KEY)) || 0;
  if (safeGet("session", VISIT_FLAG) !== "1") {
    visits += 1;
    safeSet("local", VISITS_KEY, String(visits));
    safeSet("session", VISIT_FLAG, "1");
  }
  const dismissedAt = Number(safeGet("local", DISMISSED_KEY)) || 0;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  state = {
    canPrompt: deferred !== null,
    ios,
    standalone,
    dismissed: Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000,
    visits,
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own, quieter prompt
    deferred = event as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    update({ canPrompt: false, standalone: true });
  });
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  start();
  return state;
}

function dismiss(): void {
  safeSet("local", DISMISSED_KEY, String(Date.now()));
  update({ dismissed: true });
}

async function install(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  update({ canPrompt: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "dismissed") dismiss();
  } catch {
    // The prompt can only be used once; nothing else to do.
  }
}

export interface InstallPromptProps {
  /**
   * 'banner' (default): a small dismissible card at the bottom of the screen,
   * shown to returning visitors outside the reading pages.
   * 'inline': a plain button for settings-like pages; renders nothing when
   * the site cannot be installed from this browser.
   */
  variant?: "banner" | "inline";
  className?: string;
}

function IosSteps({ t }: { t: AccountMessages["install"] }) {
  return (
    <p className="text-sm leading-relaxed text-muted">
      {t.iosBefore} <Share aria-hidden="true" className="inline size-4 align-text-bottom" /> {t.iosAfter}
    </p>
  );
}

/** Offers to install the site as an app. Never shown inside an installed app. */
export function InstallPrompt({ variant = "banner", className }: InstallPromptProps) {
  const info = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
  const pathname = usePathname() ?? "";
  const [showIos, setShowIos] = useState(false);
  const t = accountMessages(useLocale()).install;

  if (info.standalone) {
    return variant === "inline" ? (
      <p className={cn("text-sm text-muted", className)}>{t.installed}</p>
    ) : null;
  }
  const installable = info.canPrompt || info.ios;
  if (!installable) return null;

  if (variant === "inline") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div>
          <Button
            variant="outline"
            onClick={() => (info.canPrompt ? void install() : setShowIos((value) => !value))}
            aria-expanded={info.canPrompt ? undefined : showIos}
          >
            <Download aria-hidden="true" className="size-5" />
            {t.installAsApp}
          </Button>
        </div>
        {showIos && !info.canPrompt ? <IosSteps t={t} /> : null}
      </div>
    );
  }

  const quiet = QUIET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (quiet || info.dismissed || info.visits < MIN_VISITS) return null;

  return (
    <aside
      aria-label={t.bannerAria}
      className={cn(
        "site-chrome fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-lg items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-pop print:hidden",
        className,
      )}
    >
      <img src="/icons/icon.svg" alt="" width={48} height={48} className="size-12 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-bold">{t.bannerTitle}</p>
        {info.canPrompt ? (
          <>
            <p className="text-sm text-muted">{t.bannerText}</p>
            <div>
              <Button size="sm" onClick={() => void install()}>
                <Download aria-hidden="true" className="size-4" />
                {t.install}
              </Button>
            </div>
          </>
        ) : (
          <IosSteps t={t} />
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.close}
        className="inline-flex size-touch shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
      >
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
