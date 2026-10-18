"use client";

/**
 * The bedtime "radio": plays the narration of one published book after
 * another. One <audio> element is reused for every page, and the next page is
 * started from the `ended` event, so playback keeps going when the screen is
 * locked or the tab is in the background. The Media Session API puts the
 * story title, cover and play / next / previous controls on the lock screen.
 */
import { Check, Moon, Pause, Play, SkipBack, SkipForward, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockNotice } from "@/components/MockNotice";
import { Button, Card, Chip, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AGE_GROUP_INFO, ageGroupLabel, readingTimeLabel } from "@/lib/taxonomy";
import {
  fadeVolume,
  filterTracks,
  formatRemaining,
  nextPage,
  nextStory,
  previousStory,
  type AgeFilter,
  type ListenTrack,
  type QueuePosition,
} from "./tracks";

const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;
/** Consecutive pages that may fail to load before the player gives up. */
const MAX_ERRORS = 3;
/** localStorage key of the story ids the listener switched off. */
const EXCLUDED_KEY = "mystory:listen-excluded";

type Sleep = { mode: "off" } | { mode: "time"; deadline: number; minutes: number } | { mode: "story" };

export interface ListenPlayerProps {
  tracks: ListenTrack[];
  initialAge?: AgeFilter;
}

export function ListenPlayer({ tracks, initialAge = "all" }: ListenPlayerProps) {
  const [age, setAge] = useState<AgeFilter>(initialAge);
  const [position, setPosition] = useState<QueuePosition | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sleep, setSleep] = useState<Sleep>({ mode: "off" });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  // Stories of the chosen age; the queue is those the listener left ticked.
  const visible = useMemo(() => filterTracks(tracks, age), [tracks, age]);
  const queue = useMemo(() => visible.filter((track) => !excluded.has(track.id)), [visible, excluded]);
  const current = position ? (queue[position.track] ?? null) : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Media events fire outside React's render cycle; they read the latest values from refs.
  const queueRef = useRef(queue);
  const positionRef = useRef(position);
  const sleepRef = useRef(sleep);
  const errorCount = useRef(0);
  useEffect(() => {
    queueRef.current = queue;
    positionRef.current = position;
    sleepRef.current = sleep;
  }, [queue, position, sleep]);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(EXCLUDED_KEY) ?? "[]");
      if (Array.isArray(saved)) setExcluded(new Set(saved.filter((id): id is string => typeof id === "string")));
    } catch {
      // Storage unavailable or corrupt: every story stays ticked.
    }
  }, []);

  const playAt = useCallback((target: QueuePosition) => {
    const audio = audioRef.current;
    const page = queueRef.current[target.track]?.pages[target.page];
    if (!audio || !page) return;
    positionRef.current = target;
    setPosition(target);
    setMessage(null);
    audio.src = page.audioUrl;
    const started = audio.play();
    // Browsers refuse to start audio without a tap; the play button stays available.
    started?.catch(() => setPlaying(false));
  }, []);

  const stopForSleep = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.volume = 1;
    }
    sleepRef.current = { mode: "off" };
    setSleep({ mode: "off" });
    setRemaining(null);
    setMessage("הטיימר הסתיים וההשמעה נעצרה. לילה טוב!");
  }, []);

  /** Applies the sleep timer: fades out near the end and stops at the deadline. */
  const checkSleep = useCallback(() => {
    const state = sleepRef.current;
    if (state.mode !== "time") return;
    const left = (state.deadline - Date.now()) / 1000;
    if (left <= 0) {
      stopForSleep();
      return;
    }
    setRemaining(left);
    const audio = audioRef.current;
    if (audio) audio.volume = fadeVolume(left);
  }, [stopForSleep]);

  const sleepDeadline = sleep.mode === "time" ? sleep.deadline : null;
  useEffect(() => {
    if (sleepDeadline === null) return;
    // `timeupdate` also runs checkSleep, which covers timers throttled in a background tab.
    const id = window.setInterval(checkSleep, 1000);
    return () => window.clearInterval(id);
  }, [sleepDeadline, checkSleep]);

  const advance = useCallback(
    (afterError: boolean) => {
      const here = positionRef.current;
      if (!here) return;
      const step = nextPage(queueRef.current, here);
      if (!step) return;
      if (!afterError && step.storyEnded && sleepRef.current.mode === "story") {
        // Stop here, and leave the next story ready for tomorrow's first tap.
        positionRef.current = step.position;
        setPosition(step.position);
        const audio = audioRef.current;
        if (audio) audio.removeAttribute("src");
        stopForSleep();
        return;
      }
      playAt(step.position);
    },
    [playAt, stopForSleep],
  );

  const handleEnded = () => {
    errorCount.current = 0;
    advance(false);
  };

  const handleError = () => {
    // Clearing `src` also raises an error event; only real load failures count.
    if (!audioRef.current?.getAttribute("src")) return;
    errorCount.current += 1;
    if (errorCount.current >= MAX_ERRORS) {
      errorCount.current = 0;
      setPlaying(false);
      setMessage("לא הצלחנו להשמיע את ההקלטה. בדקו את החיבור לרשת ונסו שוב.");
      return;
    }
    advance(true);
  };

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const here = positionRef.current;
    if (!here) {
      playAt({ track: 0, page: 0 });
    } else if (!audio.getAttribute("src")) {
      playAt(here);
    } else if (audio.paused) {
      setMessage(null);
      audio.play()?.catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playAt]);

  const goNext = useCallback(() => {
    const target = nextStory(queueRef.current, positionRef.current ?? { track: -1, page: 0 });
    if (target) playAt(target);
  }, [playAt]);

  const goPrevious = useCallback(() => {
    const here = positionRef.current;
    if (!here) return;
    const target = previousStory(queueRef.current, here, audioRef.current?.currentTime ?? 0);
    if (target) playAt(target);
  }, [playAt]);

  const chooseAge = (next: AgeFilter) => {
    if (next === age) return;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    positionRef.current = null;
    setPosition(null);
    setPlaying(false);
    setMessage(null);
    setAge(next);
  };

  /** Applies a new set of ticked stories; the player keeps its place if the current story stays in the queue. */
  const applyExcluded = (next: ReadonlySet<string>) => {
    const nextQueue = visible.filter((track) => !next.has(track.id));
    const here = positionRef.current;
    const currentId = here ? queueRef.current[here.track]?.id : undefined;
    const newIndex = currentId ? nextQueue.findIndex((track) => track.id === currentId) : -1;
    queueRef.current = nextQueue;
    if (here && newIndex >= 0) {
      positionRef.current = { track: newIndex, page: here.page };
      setPosition(positionRef.current);
    } else if (here) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      positionRef.current = null;
      setPosition(null);
      setPlaying(false);
    }
    setExcluded(next);
    try {
      window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next]));
    } catch {
      // The selection just won't survive a reload.
    }
  };

  const toggleTrack = (id: string) => {
    const next = new Set(excluded);
    if (!next.delete(id)) next.add(id);
    applyExcluded(next);
  };

  const selectAll = (on: boolean) => {
    const next = new Set(excluded);
    for (const track of visible) {
      if (on) next.delete(track.id);
      else next.add(track.id);
    }
    applyExcluded(next);
  };

  const chooseSleep = (next: Sleep) => {
    const audio = audioRef.current;
    if (audio) audio.volume = 1;
    sleepRef.current = next;
    setSleep(next);
    setRemaining(next.mode === "time" ? next.minutes * 60 : null);
    setMessage(null);
  };

  // Lock-screen controls.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => toggle()],
      ["pause", () => audioRef.current?.pause()],
      ["stop", () => audioRef.current?.pause()],
      ["nexttrack", () => goNext()],
      ["previoustrack", () => goPrevious()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // The browser does not support this action.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Nothing to undo.
        }
      }
    };
  }, [toggle, goNext, goPrevious]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!current || typeof MediaMetadata === "undefined") {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.author || "הסיפור שלי",
      album: "האזנה לפני השינה",
      artwork: current.coverUrl
        ? [{ src: current.coverUrl, sizes: "600x800", ...(current.coverType ? { type: current.coverType } : {}) }]
        : [],
    });
  }, [current]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = !current ? "none" : playing ? "playing" : "paused";
  }, [current, playing]);

  const anyMock = queue.some((track) => track.hasMockAudio);
  const pageNumber = position && current ? position.page + 1 : 0;

  return (
    <div className="flex flex-col gap-8">
      {/* The only audio element; its controls are the buttons below. */}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onError={handleError}
        onTimeUpdate={checkSleep}
        className="hidden"
      />

      <section aria-labelledby="listen-age" className="flex flex-col gap-3">
        <h2 id="listen-age" className="text-xl font-bold">
          למי מקריאים הערב?
        </h2>
        <div className="flex flex-wrap gap-2">
          <Chip onClick={() => chooseAge("all")} selected={age === "all"}>
            כל הגילים
          </Chip>
          {AGE_GROUP_INFO.map((group) => (
            <Chip key={group.slug} icon={group.emoji} onClick={() => chooseAge(group.slug)} selected={age === group.slug}>
              {group.label}
            </Chip>
          ))}
        </div>
      </section>

      {anyMock ? <MockNotice kind="tts" /> : null}

      {visible.length === 0 ? (
        <EmptyState
          icon="🌙"
          title="אין עדיין סיפורים מוקלטים לגיל הזה"
          description="אפשר לבחור גיל אחר, או לחזור אחרי שיתווספו הקלטות."
          action={
            age !== "all" ? (
              <Button variant="secondary" onClick={() => chooseAge("all")}>
                להציג את כל הגילים
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card as="section" aria-labelledby="listen-now" padding="lg" className="flex flex-col gap-5">
            <h2 id="listen-now" className="sr-only">
              מתנגן עכשיו
            </h2>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <div className="aspect-[3/4] w-32 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-36">
                {current?.coverUrl ? (
                  <img src={current.coverUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-5xl" aria-hidden="true">
                    🌙
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-start">
                {/* Not a live region: announcing every page would talk over the narration. */}
                <div className="flex flex-col gap-1">
                  <p className="text-2xl font-bold leading-snug">{current ? current.title : "מוכנים לסיפור?"}</p>
                  <p className="text-muted">
                    {current
                      ? `חלק ${pageNumber} מתוך ${current.pages.length}`
                      : queue.length === 0
                        ? "לא סומן אף סיפור. מסמנים סיפורים ברשימה למטה."
                        : `${queue.length} סיפורים מחכים ברצף. לוחצים על הכפתור ומתחילים.`}
                  </p>
                </div>
                {current ? (
                  <progress
                    className="h-2 w-full max-w-sm overflow-hidden rounded-full accent-primary"
                    value={pageNumber}
                    max={current.pages.length}
                    aria-label="התקדמות בסיפור"
                  />
                ) : null}
                {/* Playback controls keep their left-to-right order in every language. */}
                <div dir="ltr" className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="לתחילת הסיפור או לסיפור הקודם"
                    onClick={goPrevious}
                    disabled={!current}
                  >
                    <SkipBack aria-hidden="true" className="size-6" />
                  </Button>
                  <Button
                    variant="primary"
                    size="icon-lg"
                    aria-label={playing ? "השהיה" : "הפעלה"}
                    onClick={toggle}
                    disabled={queue.length === 0}
                  >
                    {playing ? (
                      <Pause aria-hidden="true" className="size-8" />
                    ) : (
                      <Play aria-hidden="true" className="size-8" />
                    )}
                  </Button>
                  <Button variant="outline" size="icon" aria-label="לסיפור הבא" onClick={goNext} disabled={queue.length === 0}>
                    <SkipForward aria-hidden="true" className="size-6" />
                  </Button>
                </div>
              </div>
            </div>
            <p role="status" className={cn("text-center text-base sm:text-start", message ? "text-foreground" : "sr-only")}>
              {message ?? ""}
            </p>
          </Card>

          <section aria-labelledby="listen-sleep" className="flex flex-col gap-3">
            <h2 id="listen-sleep" className="flex items-center gap-2 text-xl font-bold">
              <Timer aria-hidden="true" className="size-6 text-secondary" />
              טיימר שינה
            </h2>
            <p className="text-muted">ההשמעה תיחלש בעדינות ותיעצר לבד.</p>
            <div className="flex flex-wrap gap-2">
              <Chip onClick={() => chooseSleep({ mode: "off" })} selected={sleep.mode === "off"}>
                בלי טיימר
              </Chip>
              {SLEEP_MINUTES.map((minutes) => (
                <Chip
                  key={minutes}
                  onClick={() => chooseSleep({ mode: "time", minutes, deadline: Date.now() + minutes * 60_000 })}
                  selected={sleep.mode === "time" && sleep.minutes === minutes}
                >
                  {minutes} דקות
                </Chip>
              ))}
              <Chip onClick={() => chooseSleep({ mode: "story" })} selected={sleep.mode === "story"}>
                עד סוף הסיפור
              </Chip>
            </div>
            {sleep.mode === "time" && remaining !== null ? (
              <p className="flex items-center gap-2 font-semibold">
                <Moon aria-hidden="true" className="size-5 text-secondary" />
                <span>
                  ההשמעה תיעצר בעוד{" "}
                  <span role="timer" dir="ltr" className="tabular-nums">
                    {formatRemaining(remaining)}
                  </span>
                </span>
              </p>
            ) : null}
            {sleep.mode === "story" ? (
              <p className="flex items-center gap-2 font-semibold">
                <Moon aria-hidden="true" className="size-5 text-secondary" />
                ההשמעה תיעצר בסוף הסיפור הנוכחי.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="listen-queue" className="flex flex-col gap-3">
            <h2 id="listen-queue" className="text-xl font-bold">
              הסיפורים ברצף
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted">
                {queue.length} מתוך {visible.length} סיפורים מסומנים.
              </p>
              <Chip onClick={() => selectAll(true)}>סימון הכול</Chip>
              <Chip onClick={() => selectAll(false)}>ניקוי הסימון</Chip>
            </div>
            <ul className="flex flex-col gap-2">
              {visible.map((track) => {
                const index = queue.findIndex((item) => item.id === track.id);
                const included = index >= 0;
                const isCurrent = current?.id === track.id;
                return (
                  <li key={track.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={included}
                      aria-label={`לכלול את ${track.title} ברצף`}
                      onClick={() => toggleTrack(track.id)}
                      className={cn(
                        "flex min-h-touch-lg w-14 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                        included ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-surface-2",
                      )}
                    >
                      {included ? <Check aria-hidden="true" className="size-6" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (included) {
                          playAt({ track: index, page: 0 });
                          return;
                        }
                        // Playing a story that was switched off brings it back into the queue.
                        const next = new Set(excluded);
                        next.delete(track.id);
                        applyExcluded(next);
                        playAt({ track: queueRef.current.findIndex((item) => item.id === track.id), page: 0 });
                      }}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "flex min-h-touch-lg min-w-0 flex-1 items-center gap-4 rounded-md border-2 px-4 py-3 text-start transition-colors",
                        isCurrent
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-surface hover:bg-surface-2",
                        included ? "" : "opacity-60",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold tabular-nums"
                      >
                        {isCurrent && playing ? "♪" : included ? index + 1 : "–"}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-lg font-semibold">{track.title}</span>
                        <span className="text-sm text-muted">
                          {ageGroupLabel(track.ageGroup)} · {readingTimeLabel(track.readingMinutes)}
                          {track.hasMockAudio ? " · קול הדגמה" : ""}
                        </span>
                      </span>
                      {isCurrent ? <span className="shrink-0 text-sm font-semibold">{playing ? "מתנגן" : "מושהה"}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
