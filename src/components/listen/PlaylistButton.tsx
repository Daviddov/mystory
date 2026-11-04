"use client";

import { ListMusic } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { libraryMessages } from "@/lib/i18n/library";
import { setInPlaylist } from "./playlist";

export interface PlaylistButtonProps {
  bookId: string;
  /** Whether the signed-in user already has the book in their listening playlist. */
  initialInPlaylist: boolean;
  className?: string;
}

/** "Add to my listening playlist" on the book page (signed-in users, narrated books). */
export function PlaylistButton({ bookId, initialInPlaylist, className }: PlaylistButtonProps) {
  const t = libraryMessages(useLocale()).playlistButton;
  const [inPlaylist, setIn] = useState(initialInPlaylist);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (busy) return;
    const wanted = !inPlaylist;
    setBusy(true);
    setFailed(false);
    if (await setInPlaylist(bookId, wanted)) setIn(wanted);
    else setFailed(true);
    setBusy(false);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="playlist-button">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={inPlaylist}
        aria-busy={busy || undefined}
        disabled={busy}
        className={buttonClasses({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}
      >
        <ListMusic aria-hidden="true" className={cn(inPlaylist && "text-primary")} />
        {inPlaylist ? t.inPlaylist : t.add}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
        {failed ? t.failed : null}
      </p>
    </div>
  );
}
