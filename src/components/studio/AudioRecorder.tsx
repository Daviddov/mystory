"use client";

import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MAX_RECORDING_SECONDS } from "@/lib/studio/shared";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function microphoneErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "אין הרשאה למיקרופון. אשרו את הגישה בהגדרות הדפדפן ונסו שוב.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "לא נמצא מיקרופון במכשיר הזה.";
  if (name === "NotReadableError") return "המיקרופון תפוס על ידי תוכנה אחרת.";
  return "לא הצלחנו להתחיל הקלטה.";
}

export interface AudioRecorderProps {
  /** Called with the finished recording. */
  onRecorded: (recording: Blob) => void;
  disabled?: boolean;
  /** Label of the start button. */
  label?: string;
}

/** Records the parent's voice with MediaRecorder: one button to start, one to stop. */
export function AudioRecorder({ onRecorded, disabled, label = "הקלטה בקול שלי" }: AudioRecorderProps) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const releaseDevices = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  // Leaving the page (or switching to another book page) drops an unfinished recording.
  useEffect(() => {
    discardRef.current = false;
    return () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseDevices();
    };
  }, [releaseDevices]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("הדפדפן הזה לא תומך בהקלטה. אפשר להעלות קובץ שמע במקום.");
      return;
    }
    setPhase("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      setError(microphoneErrorMessage(err));
      setPhase("idle");
      return;
    }
    if (discardRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("ההקלטה נקטעה. נסו שוב.");
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const recording = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        recorderRef.current = null;
        releaseDevices();
        if (discardRef.current) return;
        setPhase("idle");
        if (recording.size === 0) {
          setError("לא נקלט קול. בדקו את המיקרופון ונסו שוב.");
          return;
        }
        onRecordedRef.current(recording);
      };
      recorder.start();
      setSeconds(0);
      setPhase("recording");
      const startedAt = Date.now();
      tickRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) stop();
      }, 250);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("לא הצלחנו להתחיל הקלטה.");
      setPhase("idle");
    }
  }, [releaseDevices, stop]);

  return (
    <div className="flex flex-col gap-2">
      {phase === "recording" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="danger" onClick={stop}>
            <Square aria-hidden="true" className="size-5" />
            סיום ההקלטה
          </Button>
          <span role="timer" className="inline-flex items-center gap-2 font-semibold tabular-nums">
            <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-danger" />
            מקליט {formatSeconds(seconds)}
          </span>
        </div>
      ) : (
        <Button variant="outline" onClick={start} disabled={disabled} loading={phase === "requesting"}>
          <Mic aria-hidden="true" className="size-5" />
          {label}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
