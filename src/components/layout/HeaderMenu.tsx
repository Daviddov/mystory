"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export interface HeaderMenuProps {
  summary: ReactNode;
  summaryClassName?: string;
  summaryLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A <details> dropdown that closes itself: when a link or button inside it is
 * chosen, on a click elsewhere, on Escape, and when the page changes.
 */
export function HeaderMenu({ summary, summaryClassName, summaryLabel, className, children }: HeaderMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const menu = ref.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const menu = ref.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details
      ref={ref}
      className={className}
      onClick={(event) => {
        // A link or button inside the panel (not the summary) was chosen.
        const target = event.target as Element;
        if (target.closest("summary")) return;
        if (target.closest("a, button") && ref.current) ref.current.open = false;
      }}
    >
      <summary className={summaryClassName} aria-label={summaryLabel}>
        {summary}
      </summary>
      {children}
    </details>
  );
}
