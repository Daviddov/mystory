"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { splitWords } from "@/lib/hebrew";
import { activeWordIndex } from "@/lib/reader/logic";
import type { WordTiming } from "@/lib/types";
import { wordIndexAtChar } from "./useDeviceVoice";

export interface NarrationOptions {
  /** Audio URL of the current page; "" when the page has no narration. */
  src: string;
  /** One timing per word of the page, or null when highlighting is not possible. */
  timings: WordTiming[] | null;
  /** Playback speed, 1 = normal. */
  rate: number;
  /** Changes whenever the page changes; the highlight never leaks across pages. */
  pageKey: number;
  /** Keep narrating after this page ends (the player will turn the page). */
  continuous: boolean;
  /** The page audio played to its end while narration was on. */
  onPageEnded: () => void;
  /**
   * Read the page with the device's own voice instead of the audio file.
   * Used when the stored audio is the silent demo recording.
   */
  speech?: { text: string; voice: SpeechSynthesisVoice } | null;
}

export interface Narration {
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Spread on the single <audio> element the player renders. */
  audioEvents: {
    onPlay: () => void;
    onPause: () => void;
    onEnded: () => void;
    onError: () => void;
  };
  /** The listener asked for narration; it continues across page turns. */
  narrating: boolean;
  /** Sound is coming out right now. */
  isPlaying: boolean;
  /** Word being spoken on the current page, or -1. */
  activeWord: number;
  /** The current page's audio could not be loaded or played. */
  failed: boolean;
  /** The browser refused to start playback without a tap. */
  blocked: boolean;
  toggle: () => void;
  stop: () => void;
  /** Plays from a word: just that word when paused, onwards when narrating. */
  playWord: (index: number) => void;
}

/**
 * Drives one <audio> element for the whole book. The element is reused when
 * the page changes, because mobile browsers only allow programmatic play()
 * on an element the user has already started with a tap.
 */
export function useNarration({
  src,
  timings,
  rate,
  pageKey,
  continuous,
  onPageEnded,
  speech,
}: NarrationOptions): Narration {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [active, setActive] = useState({ key: -1, word: -1 });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  /** Set while a single tapped word is playing: the time at which to stop. */
  const stopAtRef = useRef<number | null>(null);

  const onPageEndedRef = useRef(onPageEnded);
  useEffect(() => {
    onPageEndedRef.current = onPageEnded;
  }, [onPageEnded]);

  // ---- Device voice ---------------------------------------------------------
  const speechText = speech?.text ?? "";
  const speechVoice = speech?.voice ?? null;
  const useSpeech = speechVoice !== null && speechText.trim().length > 0;
  /** Bumped whenever speech is started or cancelled, so events of an older utterance are ignored. */
  const speechRun = useRef(0);
  /** toggle() already started speaking inside the tap; the effect must not start it again. */
  const startedInTap = useRef(false);
  const narratingRef = useRef(narrating);
  const continuousRef = useRef(continuous);
  useEffect(() => {
    narratingRef.current = narrating;
    continuousRef.current = continuous;
  }, [narrating, continuous]);

  const cancelSpeech = useCallback(() => {
    speechRun.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  /** Speaks the page from a word onwards, or only that word when `single`. */
  const startSpeech = useCallback(
    (fromWord: number, single: boolean) => {
      if (!speechVoice) return;
      const words = splitWords(speechText);
      const spoken = single ? (words[fromWord] ?? "") : words.slice(fromWord).join(" ");
      if (!spoken) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const run = ++speechRun.current;
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.voice = speechVoice;
      utterance.lang = speechVoice.lang;
      utterance.rate = rate;
      utterance.onstart = () => {
        if (run !== speechRun.current) return;
        setIsPlaying(true);
        setActive({ key: pageKey, word: fromWord });
      };
      utterance.onboundary = (event) => {
        if (run !== speechRun.current || single) return;
        if (event.name && event.name !== "word") return;
        setActive({ key: pageKey, word: fromWord + wordIndexAtChar(spoken, event.charIndex) });
      };
      utterance.onend = () => {
        if (run !== speechRun.current) return;
        setIsPlaying(false);
        setActive({ key: pageKey, word: -1 });
        if (single || !narratingRef.current) return;
        if (!continuousRef.current) setNarrating(false);
        onPageEndedRef.current();
      };
      utterance.onerror = (event) => {
        // Cancelling an utterance reports an error too; that is not a failure.
        if (run !== speechRun.current || event.error === "canceled" || event.error === "interrupted") return;
        setIsPlaying(false);
        setNarrating(false);
        if (event.error === "not-allowed") setBlocked(true);
        else setFailedSrc(src);
      };
      synth.speak(utterance);
    },
    [speechVoice, speechText, rate, pageKey, src],
  );

  // Speak the page when narration is on, and again on every new page.
  useEffect(() => {
    if (!useSpeech || !narrating) return;
    if (startedInTap.current) startedInTap.current = false;
    else startSpeech(0, false);
    return cancelSpeech;
  }, [useSpeech, narrating, startSpeech, cancelSpeech]);

  useEffect(() => cancelSpeech, [cancelSpeech]);

  const handlePlayFailure = useCallback((error: unknown) => {
    const name = error instanceof Error ? error.name : "";
    // AbortError only means a newer load or pause replaced this play() call.
    if (name === "AbortError") return;
    setNarrating(false);
    if (name === "NotAllowedError") setBlocked(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  }, [rate, src]);

  // Start, continue on the next page, or pause, whenever the intent or the page changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    stopAtRef.current = null;
    // With the device voice the audio file (a silent demo recording) stays paused.
    if (!narrating || !src || useSpeech) {
      audio.pause();
      return;
    }
    let cancelled = false;
    audio.play().catch((error: unknown) => {
      if (!cancelled) handlePlayFailure(error);
    });
    return () => {
      cancelled = true;
    };
  }, [narrating, src, useSpeech, handlePlayFailure]);

  // Follow the audio clock while it plays. The device voice reports its own word boundaries.
  useEffect(() => {
    if (!isPlaying || useSpeech) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const time = audio.currentTime;
        if (stopAtRef.current !== null && time >= stopAtRef.current) {
          stopAtRef.current = null;
          audio.pause();
        } else if (timings) {
          const word = activeWordIndex(timings, time);
          setActive((previous) =>
            previous.key === pageKey && previous.word === word ? previous : { key: pageKey, word },
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, useSpeech, timings, pageKey]);

  const stop = useCallback(() => {
    setNarrating(false);
    stopAtRef.current = null;
    audioRef.current?.pause();
    if (useSpeech) {
      cancelSpeech();
      setIsPlaying(false);
    }
  }, [useSpeech, cancelSpeech]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (narrating) {
      stop();
      return;
    }
    setBlocked(false);
    setFailedSrc(null);
    setNarrating(true);
    // Also start here, inside the tap, so the browser treats it as user initiated.
    stopAtRef.current = null;
    if (useSpeech) {
      startedInTap.current = true;
      startSpeech(0, false);
      return;
    }
    audio.play().catch(handlePlayFailure);
  }, [narrating, src, stop, handlePlayFailure, useSpeech, startSpeech]);

  const playWord = useCallback(
    (index: number) => {
      if (useSpeech) {
        setBlocked(false);
        startSpeech(index, !narrating);
        return;
      }
      const audio = audioRef.current;
      const timing = timings?.[index];
      if (!audio || !timing || !src) return;
      setBlocked(false);
      try {
        audio.currentTime = timing.start;
      } catch {
        return;
      }
      setActive({ key: pageKey, word: index });
      stopAtRef.current = narrating ? null : timing.end;
      if (audio.paused) {
        audio.play().catch((error: unknown) => {
          const name = error instanceof Error ? error.name : "";
          if (name === "NotAllowedError") setBlocked(true);
        });
      }
    },
    [timings, src, pageKey, narrating, useSpeech, startSpeech],
  );

  const audioEvents = {
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onEnded: () => {
      setIsPlaying(false);
      setActive({ key: pageKey, word: -1 });
      const wasSingleWord = stopAtRef.current !== null;
      stopAtRef.current = null;
      if (narrating && !wasSingleWord) {
        if (!continuous) setNarrating(false);
        onPageEndedRef.current();
      }
    },
    onError: () => {
      // The element also reports an error when its src is removed; ignore that.
      if (!src) return;
      setIsPlaying(false);
      setFailedSrc(src);
      setNarrating(false);
    },
  };

  return {
    audioRef,
    audioEvents,
    narrating,
    isPlaying,
    activeWord: active.key === pageKey ? active.word : -1,
    failed: failedSrc !== null && failedSrc === src,
    blocked,
    toggle,
    stop,
    playWord,
  };
}
