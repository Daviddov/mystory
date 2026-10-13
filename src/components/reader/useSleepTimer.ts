"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SleepTimer {
  /** Seconds left, or null when no timer is running. */
  remaining: number | null;
  start: (minutes: number) => void;
  cancel: () => void;
}

/**
 * Countdown that calls `onFire` once when it reaches zero. `onTick` receives
 * the seconds left (used to fade the narration out before it stops).
 */
export function useSleepTimer(onFire: () => void, onTick?: (secondsLeft: number | null) => void): SleepTimer {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const onFireRef = useRef(onFire);
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onFireRef.current = onFire;
    onTickRef.current = onTick;
  }, [onFire, onTick]);

  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      const left = (deadline - Date.now()) / 1000;
      if (left <= 0) {
        window.clearInterval(id);
        setDeadline(null);
        setRemaining(null);
        onTickRef.current?.(null);
        onFireRef.current();
      } else {
        setRemaining(left);
        onTickRef.current?.(left);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [deadline]);

  const start = useCallback((minutes: number) => {
    setDeadline(Date.now() + minutes * 60_000);
    setRemaining(minutes * 60);
    onTickRef.current?.(minutes * 60);
  }, []);

  const cancel = useCallback(() => {
    setDeadline(null);
    setRemaining(null);
    onTickRef.current?.(null);
  }, []);

  return { remaining, start, cancel };
}
