"use client";

import { useEffect, useState } from "react";
import { removePrivateDownloads } from "@/components/pwa/offline-store";
import { syncPersonal } from "./local-store";

export interface PersonalSyncProps {
  /** Id of the signed-in user, or null. Comes from the server on every render. */
  userId: string | null;
  /** Sync without the confirmation message (for pages that mount it next to the root layout's copy). */
  quiet?: boolean;
}

/**
 * Keeps the favorites and reading progress of this device in step with the
 * account. On the first sign-in on a device it merges what the anonymous
 * visitor collected into the account. Renders only a short, polite
 * confirmation after such a merge.
 */
export function PersonalSync({ userId, quiet = false }: PersonalSyncProps) {
  const [merged, setMerged] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void syncPersonal(userId).then((result) => {
        if (cancelled) return;
        if (result.merged > 0) setMerged(result.merged);
        // Private books saved for offline reading leave a shared device at sign-out.
        if (result.cleared && !userId) void removePrivateDownloads().catch(() => undefined);
      });
    };
    run();
    // Changes made without a network are sent when it comes back.
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      window.removeEventListener("online", run);
    };
  }, [userId]);

  useEffect(() => {
    if (merged === 0) return;
    const timer = setTimeout(() => setMerged(0), 6000);
    return () => clearTimeout(timer);
  }, [merged]);

  if (merged === 0 || quiet) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-lg border border-border bg-surface px-5 py-3 text-center font-semibold shadow-pop print:hidden"
    >
      המועדפים והקריאה מהמכשיר הזה נשמרו בחשבון שלכם.
    </p>
  );
}
