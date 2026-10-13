"use client";

import { useEffect } from "react";

const SW_URL = "/sw.js";
const REFRESH_FLAG = "mystory:sw-shell-refreshed";

/**
 * Registers the service worker (public/sw.js).
 *
 * Only in production builds: in development the worker's cache-first handling
 * of /_next/static would fight hot reloading. Set NEXT_PUBLIC_ENABLE_SW=1 to
 * try it against `next dev`. In development a worker left behind by an earlier
 * production run on the same address is removed.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

    if (!enabled) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? "";
            if (script.endsWith(SW_URL)) void registration.unregister();
          }
        })
        .catch(() => undefined);
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register(SW_URL, { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          // A worker that is installing right now is already fetching the offline pages.
          if (registration.installing) return;
          let refreshed = false;
          try {
            refreshed = sessionStorage.getItem(REFRESH_FLAG) === "1";
            sessionStorage.setItem(REFRESH_FLAG, "1");
          } catch {
            // no session storage: refresh on every load, which is harmless
          }
          // Once per browser session: pick up the offline pages of the latest deploy.
          if (!refreshed && navigator.onLine) registration.active?.postMessage({ type: "refresh-shell" });
        })
        .catch((error) => {
          console.warn("[pwa] service worker registration failed", error);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
