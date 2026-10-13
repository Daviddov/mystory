"use client";

import { useEffect, useState } from "react";

/** The best Hebrew voice among the ones the device offers, or null. Local voices win over network ones. */
export function pickHebrewVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Some engines still report Hebrew with the legacy code "iw".
  const hebrew = voices.filter((voice) => /^(he|iw)\b/i.test(voice.lang.replace("_", "-")));
  return hebrew.find((voice) => voice.localService) ?? hebrew[0] ?? null;
}

/**
 * The device's own Hebrew voice (Web Speech API), used to read a page aloud
 * when the book has no real narration. Null when the browser has no speech
 * synthesis or no Hebrew voice; the list often arrives after the first render.
 */
export function useDeviceVoice(enabled: boolean): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const update = () => setVoice(pickHebrewVoice(synth.getVoices()));
    update();
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, [enabled]);

  return enabled ? voice : null;
}

/** Index of the word that contains character `charIndex` of `text`, in splitWords() order. */
export function wordIndexAtChar(text: string, charIndex: number): number {
  const before = text.slice(0, Math.max(0, charIndex));
  const started = before.split(/\s+/).filter((word) => word.length > 0).length;
  // A boundary at the first letter of a word: that word has not been counted yet.
  const atWordStart = charIndex === 0 || /\s/.test(text[charIndex - 1] ?? "");
  return atWordStart ? started : started - 1;
}
