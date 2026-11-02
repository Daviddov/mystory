"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/** Loudness of the background music under the narration (the narration plays at 1). */
export const SOUNDTRACK_LEVEL = 0.16;
/** Seconds the music takes to rise when the narration starts, and to fall when it stops. */
const FADE_IN_SECONDS = 1.5;
const FADE_OUT_SECONDS = 0.8;

export interface Soundtrack {
  audioRef: RefObject<HTMLAudioElement | null>;
  /**
   * Call inside a tap that starts the narration. Mobile browsers only allow
   * play() that a tap started, and iOS ignores audio.volume, so the first tap
   * also routes the element through a Web Audio gain.
   */
  unlock: () => void;
}

interface Chain {
  context: AudioContext;
  gain: GainNode;
}

/**
 * Background music of a book: one looping <audio> element that fades in
 * while the narration plays and fades out (then pauses) when it stops.
 * `level` is the target loudness, 0 to mute it.
 */
export function useSoundtrack(src: string, playing: boolean, level: number): Soundtrack {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chainRef = useRef<Chain | null>(null);
  const pauseTimer = useRef<number | null>(null);
  const audible = playing && level > 0 && !!src;

  const unlock = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (!chainRef.current && typeof window !== "undefined" && "AudioContext" in window) {
      try {
        const context = new AudioContext();
        const gain = context.createGain();
        gain.gain.value = 0;
        context.createMediaElementSource(audio).connect(gain).connect(context.destination);
        chainRef.current = { context, gain };
      } catch {
        // No Web Audio: the element's own volume is used.
      }
    }
    void chainRef.current?.context.resume().catch(() => {});
    if (audio.paused) {
      if (!chainRef.current) audio.volume = 0;
      audio.play().catch(() => {
        // Refused without a tap; the effect below tries again when the narration starts.
      });
    }
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
    const target = audible ? level : 0;
    const seconds = audible ? FADE_IN_SECONDS : FADE_OUT_SECONDS;
    const chain = chainRef.current;
    if (audible && audio.paused) audio.play().catch(() => {});
    let frame = 0;
    if (chain) {
      const now = chain.context.currentTime;
      chain.gain.gain.cancelScheduledValues(now);
      chain.gain.gain.setValueAtTime(chain.gain.gain.value, now);
      chain.gain.gain.linearRampToValueAtTime(target, now + seconds);
    } else {
      const from = audio.volume;
      const start = performance.now();
      const step = () => {
        const progress = Math.min(1, (performance.now() - start) / (seconds * 1000));
        audio.volume = from + (target - from) * progress;
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }
    if (!audible) pauseTimer.current = window.setTimeout(() => audio.pause(), seconds * 1000 + 100);
    return () => cancelAnimationFrame(frame);
  }, [audible, level]);

  useEffect(
    () => () => {
      if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
      void chainRef.current?.context.close().catch(() => {});
    },
    [],
  );

  return { audioRef, unlock };
}
