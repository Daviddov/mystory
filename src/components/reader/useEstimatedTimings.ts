"use client";

import { useEffect, useState } from "react";
import { detectSpeech, estimateWordTimings } from "@/lib/reader/estimate-timings";
import type { WordTiming } from "@/lib/types";

/** Estimates already made in this tab, by audio URL and text (a page revisited is instant). */
const cache = new Map<string, WordTiming[]>();

/** All channels of a decoded recording mixed to one. */
function mono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

async function estimate(src: string, text: string, signal: AbortSignal): Promise<WordTiming[] | null> {
  const response = await fetch(src, { signal });
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  // An offline context decodes without asking to play sound (no user gesture needed).
  const context = new OfflineAudioContext(1, 1, 16000);
  const buffer = await context.decodeAudioData(bytes);
  const timings = estimateWordTimings(text, detectSpeech(mono(buffer), buffer.sampleRate), buffer.duration);
  return timings.length > 0 ? timings : null;
}

/**
 * Word timings guessed from a recording that has none (a family recording, a
 * narration uploaded in the studio), so the reader can still follow the voice.
 * Null until the recording is analysed, when disabled, and when the browser
 * cannot decode it: the page then simply has no highlighting.
 */
export function useEstimatedTimings({
  src,
  text,
  enabled,
}: {
  src: string;
  /** The text exactly as displayed: timing i belongs to splitWords(text)[i]. */
  text: string;
  enabled: boolean;
}): WordTiming[] | null {
  const key = `${src}\n${text}`;
  const [result, setResult] = useState<{ key: string; timings: WordTiming[] | null } | null>(null);
  const active = enabled && src !== "" && text.trim() !== "" && typeof OfflineAudioContext !== "undefined";

  useEffect(() => {
    if (!active || cache.has(key)) return;
    const controller = new AbortController();
    estimate(src, text, controller.signal)
      .then((timings) => {
        if (timings) cache.set(key, timings);
        if (!controller.signal.aborted) setResult({ key, timings });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, timings: null });
      });
    return () => controller.abort();
  }, [active, key, src, text]);

  if (!active) return null;
  return cache.get(key) ?? (result?.key === key ? result.timings : null);
}
