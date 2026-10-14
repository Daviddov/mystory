"use client";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Languages,
  Maximize,
  Mic,
  Minimize,
  Moon,
  Pause,
  Play,
  Settings,
  Sun,
  Timer,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MockNotice } from "@/components/MockNotice";
import type { RecordingView } from "@/lib/recordings/client";
import { useTheme } from "@/components/ThemeToggle";
import { Button, ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { LANGUAGE_NAMES_HE } from "@/lib/credits";
import { countWords } from "@/lib/hebrew";
import { mediaUrl } from "@/lib/media/url";
import {
  FONT_SIZES_REM,
  bookHasNikud,
  clamp,
  defaultFontStep,
  formatCountdown,
  keyToAction,
  pageDisplayText,
  resolveStartPage,
  swipeToAction,
  switchableOriginalLanguage,
  usableTimings,
  type PlayerBook,
  type ReaderAction,
  type StoredProgress,
} from "@/lib/reader/logic";
import {
  loadLocalProgress,
  loadReaderPrefs,
  saveLocalProgress,
  saveReaderPrefs,
  type ReaderPrefs,
} from "@/lib/reader/storage";
import { routes } from "@/lib/routes";
import { applyTheme } from "@/lib/theme";
import type { PublicBook } from "@/lib/public-book";
import { bookLanguage, type BookLanguage } from "@/lib/types";
import { EndScreen } from "./EndScreen";
import { ReaderSettings } from "./ReaderSettings";
import { SpeedControl } from "./SpeedControl";
import { StartScreen } from "./StartScreen";
import { ProgressScrubber } from "./ProgressScrubber";
import { RecordingPanel } from "./RecordingPanel";
import { StoryText } from "./StoryText";
import { useDeviceVoice } from "./useDeviceVoice";
import { useNarration } from "./useNarration";
import { useSleepTimer } from "./useSleepTimer";
import { VoicePicker } from "./VoicePicker";

export interface BookPlayerProps {
  /** Any book in the shared shape. Pass it through toPlayerBook() on the server first. */
  book: PlayerBook;
  /**
   * 'page' covers the whole viewport and hides the site header and footer.
   * 'embedded' fills its parent box (give the parent a height) for previews.
   * Default 'page'.
   */
  variant?: "page" | "embedded";
  /** Zero-based page to open. When set, the saved position is ignored. */
  initialPage?: number;
  /** The signed-in reader's saved position, loaded on the server. */
  serverProgress?: StoredProgress | null;
  /** Books offered on the end screen. PublicBook: these props are serialised into the page for every reader. */
  recommendations?: PublicBook[];
  /** Where the exit button leads. Default: the book page ('page' variant) or no exit button ('embedded'). */
  exitHref?: string | null;
  /** Renders the exit control as a button that calls this instead of a link. */
  onExit?: () => void;
  /** Remember the position and settings on this device. Default: true for 'page', false for 'embedded'. */
  persist?: boolean;
  /** Also POST the position to /api/progress (signed-in readers). Failures are ignored. */
  syncProgress?: boolean;
  /**
   * Share token of an unpublished book that was opened by link: sent with the
   * progress request and added to the media URLs (pictures and audio of an
   * unpublished book are not public).
   */
  shareToken?: string;
  /** Keep ?page= in the address bar in step with the current page. */
  syncUrl?: boolean;
  /**
   * Try to start the narration as soon as the book opens (the "listen" entry
   * of the book page). Browsers may refuse playback that no tap started; the
   * reader then shows its "press play" message.
   */
  autoNarrate?: boolean;
  /** Family recordings the reader may pick as the narration: approved ones and the reader's own. */
  recordings?: RecordingView[];
  /**
   * Turns on "record in my voice". Signed-out readers get `loginHref` instead.
   * `canShare`: sending a recording for sharing is possible (published books).
   */
  recorder?: { signedIn: boolean; loginHref: string; canShare: boolean };
  /** Recording id to start with (a "listen" link from the shelf). */
  initialVoice?: string;
  /** Open on a cover screen that asks how to start: read, listen or download (books opened from their card). */
  startScreen?: boolean;
  /** The download control offered on the start screen. */
  downloadControl?: ReactNode;
  /** Report one reading to POST /api/views/<bookId>, once per browser session. Published books only. */
  countView?: boolean;
  className?: string;
}

/** Width / height up to which a picture counts as square or tall and gets the text beside it. */
const SIDE_BY_SIDE_MAX_RATIO = 1.2;

const READER_CSS = `
@keyframes mystory-reader-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.mystory-reader-spread { animation: mystory-reader-page-in 0.25s ease-out; }
.mystory-reader-text { max-height: 45%; }
@media (orientation: landscape) and (max-height: 560px) {
  .mystory-reader-spread { flex-direction: row; }
  .mystory-reader-text { max-height: 100%; width: 50%; }
}
@media (prefers-reduced-motion: reduce) { .mystory-reader-spread { animation: none; } }
@keyframes mystory-kb-0 { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.06) translate(-1%, -0.8%); } }
@keyframes mystory-kb-1 { from { transform: scale(1.06) translate(1%, 0.6%); } to { transform: scale(1) translate(0, 0); } }
@keyframes mystory-kb-2 { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.06) translate(1%, 0.8%); } }
@keyframes mystory-kb-3 { from { transform: scale(1.06) translate(-1%, -0.6%); } to { transform: scale(1) translate(0, 0); } }
.mystory-kenburns { animation: var(--kb-name) var(--kb-duration, 16s) ease-in-out infinite alternate both; will-change: transform; }
.mystory-motion-paused .mystory-kenburns { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .mystory-kenburns { animation: none; } }
`;

/**
 * "Living pictures": a still illustration drifts and zooms by at most 6% inside
 * its frame (the frame clips it), never enough to lose what matters. Each page
 * gets the next of four directions so turning pages does not repeat the move.
 * A long page moves slower: about as long as reading it aloud, 12 to 20 seconds.
 */
function kenBurnsStyle(pageIndex: number, words: number): CSSProperties {
  const seconds = Math.min(20, Math.max(12, Math.round(words * 0.7)));
  return { "--kb-name": `mystory-kb-${pageIndex % 4}`, "--kb-duration": `${seconds}s` } as CSSProperties;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function reducedMotionList(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const list = reducedMotionList();
  if (!list) return () => {};
  if (typeof list.addEventListener === "function") {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }
  // Safari before 14.
  list.addListener?.(onChange);
  return () => list.removeListener?.(onChange);
}

/** True while the device asks for less motion. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => reducedMotionList()?.matches ?? false,
    () => false,
  );
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** True while the tab is in the background or the screen is off. */
function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "hidden",
    () => false,
  );
}

/** Short label of the language switch: the language it switches to. */
const LANGUAGE_CODES: Record<BookLanguage, string> = { he: "עב", en: "EN" };

const subscribeNever = () => () => {};

type FullscreenTarget = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function fullscreenSupported(): boolean {
  const doc = document as FullscreenDocument;
  return !!(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("button, a, summary, [role='button']");
}

/**
 * The reading player: one page at a time with a big illustration, the text
 * under it, narration with word highlighting, and child-sized controls.
 * It renders on the client only, because the start page and the settings
 * come from this device's storage.
 */
export function BookPlayer(props: BookPlayerProps) {
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const page = (props.variant ?? "page") === "page";
  if (!isClient) {
    return (
      <div
        data-immersive={page ? "" : undefined}
        className={cn(
          "flex items-center justify-center bg-background",
          page ? "fixed inset-0 z-40" : "h-full min-h-[30rem] w-full",
          props.className,
        )}
      >
        <Spinner size="lg" label="פותחים את הספר…" />
      </div>
    );
  }
  // A different book gets a fresh player (position, audio and timers all reset).
  return <Player key={props.book.id} {...props} />;
}

function Player({
  book,
  variant = "page",
  initialPage,
  serverProgress,
  recommendations = [],
  exitHref,
  onExit,
  persist,
  syncProgress = false,
  shareToken,
  syncUrl = false,
  autoNarrate = false,
  startScreen = false,
  recordings,
  recorder,
  initialVoice,
  downloadControl,
  countView = false,
  className,
}: BookPlayerProps) {
  const isPage = variant === "page";
  const remember = persist ?? isPage;
  const pageCount = book.pages.length;

  // ---- Position -----------------------------------------------------------
  const [start] = useState(() =>
    resolveStartPage({
      pageCount,
      requested: initialPage,
      local: remember ? loadLocalProgress(book.id) : null,
      server: serverProgress,
    }),
  );
  const [index, setIndex] = useState(start.index);
  const atEnd = pageCount > 0 && index >= pageCount;
  const current = atEnd ? undefined : book.pages[index];
  const upcoming = book.pages[index + 1];

  // ---- Narration versions: the book's own and family recordings ------------
  const hasOriginalAudio = useMemo(() => book.pages.some((entry) => !!entry.audio), [book]);
  const [versions, setVersions] = useState<RecordingView[]>(() => recordings ?? []);
  const [voiceId, setVoiceId] = useState<string | null>(() => {
    if (initialVoice && recordings?.some((version) => version.id === initialVoice)) return initialVoice;
    return hasOriginalAudio ? null : (recordings?.find((version) => version.pages.length > 0)?.id ?? null);
  });
  const voice = versions.find((version) => version.id === voiceId) ?? null;
  const [recordMode, setRecordMode] = useState(false);
  /** The own recording that new takes go into; null starts a new one with the next take. */
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const activeRecording = versions.find((version) => version.id === recordingId && version.mine) ?? null;
  const voiceAudio = (pageIndex: number): string => {
    if (!voice) {
      const page = book.pages[pageIndex];
      return page?.audio ? mediaUrl(page.audio, book.updatedAt, shareToken) : "";
    }
    const take = voice.pages.find((page) => page.index === pageIndex);
    return take ? mediaUrl(take.audio, voice.updatedAt, shareToken) : "";
  };
  const upsertVersion = (next: RecordingView) => {
    setVersions((list) =>
      list.some((version) => version.id === next.id)
        ? list.map((version) => (version.id === next.id ? next : version))
        : [next, ...list],
    );
  };

  const advanceTimer = useRef<number | undefined>(undefined);
  const clearAdvance = useCallback(() => {
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = undefined;
  }, []);
  useEffect(() => clearAdvance, [clearAdvance]);

  const turn = useCallback(
    (delta: number) => {
      clearAdvance();
      setIndex((value) => clamp(value + delta, 0, pageCount));
    },
    [clearAdvance, pageCount],
  );
  const jump = useCallback(
    (target: number) => {
      clearAdvance();
      setIndex(clamp(target, 0, pageCount));
    },
    [clearAdvance, pageCount],
  );

  // ---- Settings -----------------------------------------------------------
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => (remember ? loadReaderPrefs() : {}));
  const updatePrefs = (patch: ReaderPrefs) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (remember) saveReaderPrefs(next);
  };
  const fontStep = clamp(prefs.fontStep ?? defaultFontStep(book.ageGroup), 0, FONT_SIZES_REM.length - 1);
  const rate = prefs.rate ?? 1;
  const autoAdvance = prefs.autoAdvance ?? true;
  const textLayout = prefs.textLayout ?? "side";
  // Living pictures are on by default; the device's reduced-motion setting always wins.
  const liveImages = prefs.liveImages ?? true;
  const reducedMotion = useReducedMotion();
  const animatePictures = liveImages && !reducedMotion;
  const nikudAvailable = useMemo(() => bookHasNikud(book), [book]);
  // Vocalized text is the default wherever a book has it.
  const nikudOn = nikudAvailable && (prefs.nikud ?? true);
  // A translated book that kept its source text can be read in either language.
  const originalLanguage = useMemo(() => switchableOriginalLanguage(book), [book]);
  const showOriginal = originalLanguage !== null && (prefs.original ?? false);
  // A page without source text (added after the translation) stays in the book's language.
  const originalText = showOriginal ? (current?.originalText ?? "").trim() : "";
  const inOriginal = originalText !== "";

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(() =>
    start.resumed ? `ממשיכים מעמוד ${start.index + 1}, איפה שעצרנו.` : null,
  );
  const [noticeAction, setNoticeAction] = useState<"restart" | null>(() => (start.resumed ? "restart" : null));
  useEffect(() => {
    if (notice === null) return;
    const id = window.setTimeout(() => {
      setNotice(null);
      setNoticeAction(null);
    }, 7000);
    return () => window.clearTimeout(id);
  }, [notice]);
  const showNotice = (message: ReactNode) => {
    setNoticeAction(null);
    setNotice(message);
  };

  // ---- Narration ----------------------------------------------------------
  const hasAnyAudio = hasOriginalAudio || versions.some((version) => version.pages.length > 0);
  // `shareToken` is set only for an unpublished book opened through its share link;
  // its media is not public, so every media URL carries the token.
  const audioSrc = atEnd ? "" : voiceAudio(index);
  const upcomingAudio = index + 1 < pageCount ? voiceAudio(index + 1) : "";
  // The narration is of the translation: its word timings do not fit the original text.
  // Family recordings have no word timings.
  const timings = useMemo(
    () => (current && !inOriginal && voiceId === null ? usableTimings(current) : null),
    [current, inOriginal, voiceId],
  );
  const isLastPage = index === pageCount - 1;

  const handlePageEnded = useCallback(() => {
    if (!autoAdvance) return;
    clearAdvance();
    // A short breath between pages, so the turn does not feel abrupt.
    advanceTimer.current = window.setTimeout(() => turn(1), 700);
  }, [autoAdvance, clearAdvance, turn]);

  // The demo recording is silent. When the device has a Hebrew voice, it reads the page instead.
  const isDemoAudio = voiceId === null && !!current?.audio && current.audioSource === "mock";
  const deviceVoice = useDeviceVoice(hasAnyAudio);
  const speech = useMemo(
    () => (isDemoAudio && deviceVoice && current ? { text: current.text, voice: deviceVoice } : null),
    [isDemoAudio, deviceVoice, current],
  );

  const narration = useNarration({
    src: audioSrc,
    timings,
    rate,
    pageKey: index,
    continuous: autoAdvance && !isLastPage,
    onPageEnded: handlePageEnded,
    speech,
  });
  const { narrating, stop: stopNarration, audioRef, toggle: toggleNarration } = narration;

  // Recording mode continues the own recording that is playing, or the latest own one.
  const enterRecordMode = () => {
    stopNarration();
    clearAdvance();
    const own = voice?.mine ? voice : (versions.find((version) => version.mine) ?? null);
    setRecordingId(own?.id ?? null);
    if (own) setVoiceId(own.id);
    setRecordMode(true);
  };

  // Opened through a "listen" link: start reading aloud once, if this page has audio.
  const autoNarrateDone = useRef(false);
  useEffect(() => {
    if (!autoNarrate || autoNarrateDone.current || !audioSrc) return;
    autoNarrateDone.current = true;
    toggleNarration();
  }, [autoNarrate, audioSrc, toggleNarration]);

  // One anonymous "view" per book and browser session, for the popularity shelf.
  useEffect(() => {
    if (!countView || pageCount === 0) return;
    const key = `mystory:viewed:${book.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (private mode): count anyway.
    }
    fetch(`/api/views/${encodeURIComponent(book.id)}`, { method: "POST", keepalive: true }).catch(() => {
      // Popularity is a nicety; reading goes on.
    });
  }, [countView, pageCount, book.id]);

  // A page without narration inside a narrated book: wait about as long as
  // reading it aloud would take, then keep going.
  const currentWordCount = current ? countWords(current.text) : 0;
  useEffect(() => {
    if (!narrating || !autoAdvance || atEnd || audioSrc) return;
    const id = window.setTimeout(() => turn(1), Math.max(4000, currentWordCount * 700));
    return () => window.clearTimeout(id);
  }, [narrating, autoAdvance, atEnd, audioSrc, currentWordCount, turn]);

  // ---- Sleep timer --------------------------------------------------------
  const [asleep, setAsleep] = useState(false);
  const [choosing, setChoosing] = useState(startScreen);
  const handleSleepFire = useCallback(() => {
    clearAdvance();
    stopNarration();
    setSettingsOpen(false);
    setAsleep(true);
  }, [clearAdvance, stopNarration]);
  const handleSleepTick = useCallback(
    (secondsLeft: number | null) => {
      const audio = audioRef.current;
      if (!audio) return;
      // Fade out over the last ten seconds instead of cutting off mid-word.
      audio.volume = secondsLeft !== null && secondsLeft < 10 ? Math.max(0.05, secondsLeft / 10) : 1;
    },
    [audioRef],
  );
  const sleep = useSleepTimer(handleSleepFire, handleSleepTick);

  // ---- Bedtime theme and fullscreen ---------------------------------------
  const bedtime = useTheme() === "bedtime";
  const containerRef = useRef<HTMLDivElement>(null);
  const [canFullscreen] = useState(fullscreenSupported);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(fullscreenElement() !== null);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  const toggleFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    const target = containerRef.current as FullscreenTarget | null;
    try {
      if (fullscreenElement()) {
        void (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
      } else if (target) {
        const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
        const result = request?.call(target);
        if (result instanceof Promise) result.catch(() => {});
      }
    } catch {
      // Fullscreen is a nicety; the reader works the same without it.
    }
  }, []);

  // ---- Saving the position ------------------------------------------------
  const savedIndex = useRef(start.index);
  useEffect(() => {
    if (pageCount === 0 || savedIndex.current === index) return;
    savedIndex.current = index;
    const completed = index >= pageCount;
    const pageIndex = Math.min(index, pageCount - 1);
    if (remember) saveLocalProgress(book.id, pageIndex, completed);
    if (!syncProgress) return;
    const id = window.setTimeout(
      () => {
        fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId: book.id, pageIndex, completed, token: shareToken }),
          keepalive: true,
        }).catch(() => {
          // The position is still saved on this device.
        });
      },
      completed ? 0 : 600,
    );
    return () => window.clearTimeout(id);
  }, [index, pageCount, remember, syncProgress, shareToken, book.id]);

  useEffect(() => {
    if (!syncUrl) return;
    const url = new URL(window.location.href);
    if (index > 0 && index < pageCount) url.searchParams.set("page", String(index + 1));
    else url.searchParams.delete("page");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [index, pageCount, syncUrl]);

  // ---- Input: keyboard and swipe ------------------------------------------
  const handleAction = (action: ReaderAction) => {
    switch (action) {
      case "next":
        turn(1);
        break;
      case "prev":
        turn(-1);
        break;
      case "first":
        jump(0);
        break;
      case "last":
        jump(pageCount - 1);
        break;
      case "toggle-audio":
        if (audioSrc) narration.toggle();
        else turn(1);
        break;
      case "fullscreen":
        if (canFullscreen) toggleFullscreen();
        break;
    }
  };
  const handleKey = (event: KeyboardEvent | ReactKeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (settingsOpen || asleep || choosing || pageCount === 0 || isTypingTarget(event.target)) return;
    const action = keyToAction(event.key);
    if (!action) return;
    // Enter and Space on a focused button or link must press it, not turn the page.
    if ((event.key === "Enter" || event.key === " " || event.key === "Spacebar") && isActivatable(event.target)) {
      return;
    }
    event.preventDefault();
    handleAction(action);
  };
  const handleKeyRef = useRef(handleKey);
  useEffect(() => {
    handleKeyRef.current = handleKey;
  });
  useEffect(() => {
    if (!isPage) return;
    const listener = (event: KeyboardEvent) => handleKeyRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [isPage]);

  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastSwipeAt = useRef(0);
  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const begin = swipeStart.current;
    swipeStart.current = null;
    if (!begin || begin.id !== event.pointerId) return;
    const dx = event.clientX - begin.x;
    const dy = event.clientY - begin.y;
    const action = swipeToAction(dx, dy);
    if (!action) {
      // A plain tap on the page turns it, unless it landed on a control or on a word that plays.
      if (atEnd || Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
      const target = event.target as Element;
      if (target.closest("button, a, input, select, textarea, [role='status']")) return;
      if (timings && target.closest("[data-word]")) return;
      turn(1);
      return;
    }
    lastSwipeAt.current = event.timeStamp;
    handleAction(action);
  };
  const onWordTap = (wordIndex: number) => {
    // The tap that ends a swipe must not also play a word.
    if (performance.now() - lastSwipeAt.current < 400) return;
    narration.playWord(wordIndex);
  };

  // ---- Derived view data --------------------------------------------------
  const [brokenImage, setBrokenImage] = useState<string | null>(null);
  const imageSrc = current?.image ? mediaUrl(current.image, book.updatedAt, shareToken) : "";
  const imageReady = imageSrc !== "" && brokenImage !== imageSrc;
  // An animated page plays its clip (the illustration is its poster). A clip that
  // fails, reduced motion and "living pictures" off all fall back to the still picture.
  const [brokenVideo, setBrokenVideo] = useState<string | null>(null);
  const videoSrc = animatePictures && current?.video ? mediaUrl(current.video, book.updatedAt, shareToken) : "";
  const showVideo = videoSrc !== "" && brokenVideo !== videoSrc;
  const showImage = showVideo || imageReady;
  const pictureAlt = current?.imageAlt?.trim() || `איור לעמוד ${index + 1}`;
  // The clip is decorative: it rests while the tab is hidden, the sleep screen is up or the start screen covers it.
  const pageHidden = usePageHidden();
  const motionActive = !pageHidden && !asleep && !(choosing && !atEnd);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React sets `muted` as a property only; browsers allow autoplay only for muted media.
    video.muted = true;
    try {
      if (motionActive) {
        const started = video.play() as Promise<void> | undefined;
        started?.catch(() => {
          // Autoplay refused (low-power mode): the poster stays, which is fine.
        });
      } else {
        video.pause();
      }
    } catch {
      // No media playback here (tests, very old browsers): the poster stays.
    }
  }, [motionActive, videoSrc]);
  // "Pictures only" still shows the words of a page that has no picture.
  const showText = !showImage || textLayout !== "hidden";
  // "Beside" puts the text next to a square or tall picture; a wide picture keeps it underneath.
  const [imageShape, setImageShape] = useState<{
    src: string;
    ratio: number;
  } | null>(null);
  // The clip is the picture letterboxed into 16:9 (or 9:16), so the layout and the crop
  // below follow the still picture's shape, read from the poster.
  const imageRatio = imageShape?.src === imageSrc ? imageShape.ratio : null;
  useEffect(() => {
    if (!showVideo || !imageReady) return;
    let live = true;
    const probe = new Image();
    probe.onload = () => {
      if (live && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setImageShape({ src: imageSrc, ratio: probe.naturalWidth / probe.naturalHeight });
      }
    };
    probe.src = imageSrc;
    return () => {
      live = false;
    };
  }, [showVideo, imageReady, imageSrc]);
  const sideBySide = showImage && textLayout === "side" && imageRatio !== null && imageRatio <= SIDE_BY_SIDE_MAX_RATIO;
  const text = current ? (inOriginal ? originalText : pageDisplayText(current, nikudOn)) : "";
  const textLanguage = inOriginal && originalLanguage ? originalLanguage : bookLanguage(book);
  const title = (showOriginal && book.credits?.originalTitle) || book.title;
  const otherLanguage = showOriginal ? bookLanguage(book) : originalLanguage;

  const readAgain = () => {
    stopNarration();
    jump(0);
  };

  const resolvedExitHref = exitHref === undefined ? (isPage ? routes.book(book.slug) : null) : exitHref;
  const exitControl = (size: "icon" | "lg"): ReactNode => {
    const content =
      size === "icon" ? (
        <ArrowRight aria-hidden="true" />
      ) : (
        <>
          <ArrowRight aria-hidden="true" />
          יציאה מהספר
        </>
      );
    const label = size === "icon" ? "יציאה מהספר" : undefined;
    if (onExit) {
      return (
        <Button variant={size === "icon" ? "ghost" : "outline"} size={size} aria-label={label} title={label} onClick={onExit}>
          {content}
        </Button>
      );
    }
    if (resolvedExitHref) {
      return (
        <ButtonLink
          href={resolvedExitHref}
          variant={size === "icon" ? "ghost" : "outline"}
          size={size}
          aria-label={label}
          title={label}
        >
          {content}
        </ButtonLink>
      );
    }
    return null;
  };

  const containerClass = cn(
    "flex flex-col overflow-hidden bg-background text-foreground",
    isPage ? "fixed inset-0 z-40" : "relative h-full min-h-[30rem] w-full rounded-lg border border-border",
    className,
  );
  const containerStyle = { "--story-font-size": `${FONT_SIZES_REM[fontStep]}rem` } as CSSProperties;

  if (pageCount === 0) {
    return (
      <div data-immersive={isPage ? "" : undefined} className={cn(containerClass, "items-center justify-center p-6")}>
        <EmptyState
          icon="📖"
          title="בספר הזה אין עדיין עמודים"
          description="אחרי שיתווספו עמודים אפשר יהיה לקרוא אותו כאן."
          action={exitControl("lg")}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-immersive={isPage ? "" : undefined}
      className={containerClass}
      style={containerStyle}
      tabIndex={isPage ? undefined : 0}
      onKeyDown={isPage ? undefined : handleKey}
      role="region"
      aria-label={`קוראים: ${book.title}`}
    >
      <style>{READER_CSS}</style>

      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-1 px-2 py-1.5 sm:gap-2 sm:px-4">
        {exitControl("icon")}
        <h1 dir="auto" className="min-w-0 flex-1 truncate px-1 text-start text-lg font-bold sm:text-xl">
          {title}
        </h1>

        {otherLanguage ? (
          <button
            type="button"
            aria-label={`להציג את הסיפור ב${LANGUAGE_NAMES_HE[otherLanguage]}`}
            title={`להציג את הסיפור ב${LANGUAGE_NAMES_HE[otherLanguage]}`}
            onClick={() => updatePrefs({ original: !showOriginal })}
            className="inline-flex min-h-touch shrink-0 items-center gap-1 rounded-full border-2 border-border-strong bg-surface px-3 text-base font-bold text-foreground transition-colors hover:bg-surface-2"
          >
            <Languages aria-hidden="true" className="size-5" />
            <span aria-hidden="true">{LANGUAGE_CODES[otherLanguage]}</span>
          </button>
        ) : null}

        <button
          type="button"
          hidden={showOriginal}
          aria-pressed={nikudOn}
          aria-disabled={!nikudAvailable}
          title={nikudAvailable ? "הצגת ניקוד" : "לספר הזה אין גרסה מנוקדת"}
          onClick={() => {
            if (!nikudAvailable) {
              showNotice("לספר הזה אין גרסה מנוקדת, ולכן אי אפשר להציג ניקוד.");
              return;
            }
            updatePrefs({ nikud: !nikudOn });
          }}
          className={cn(
            "inline-flex min-h-touch shrink-0 items-center rounded-full border-2 px-3 font-story text-lg font-bold transition-colors",
            nikudOn
              ? "border-secondary bg-secondary text-secondary-foreground"
              : "border-border-strong bg-surface text-foreground hover:bg-surface-2",
            !nikudAvailable && "cursor-not-allowed opacity-50",
          )}
        >
          <span aria-hidden="true">נִקּוּד</span>
          <span className="sr-only">ניקוד</span>
        </button>

        {sleep.remaining !== null ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex min-h-touch shrink-0 items-center gap-1 rounded-full bg-primary-soft px-3 text-sm font-semibold"
            aria-label={`טיימר שינה: נשארו ${formatCountdown(sleep.remaining)}`}
          >
            <Timer aria-hidden="true" className="size-4" />
            <span dir="ltr">{formatCountdown(sleep.remaining)}</span>
          </button>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          aria-pressed={bedtime}
          aria-label="מצב לפני השינה"
          title={bedtime ? "חזרה למצב יום" : "מצב לפני השינה"}
          onClick={() => applyTheme(bedtime ? "day" : "bedtime")}
        >
          {bedtime ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </Button>
        {canFullscreen ? (
          <Button
            variant="ghost"
            size="icon"
            className="max-sm:hidden"
            aria-pressed={isFullscreen}
            aria-label="מסך מלא"
            title={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </Button>
        ) : null}
        {recorder && !atEnd ? (
          recorder.signedIn ? (
            <Button
              variant={recordMode ? "danger" : "ghost"}
              size="icon"
              aria-pressed={recordMode}
              aria-label="הקלטה בקול שלי"
              title={recordMode ? "סיום מצב ההקלטה" : "להקליט את הסיפור בקול שלי"}
              onClick={() => (recordMode ? setRecordMode(false) : enterRecordMode())}
            >
              <Mic aria-hidden="true" />
            </Button>
          ) : (
            <ButtonLink
              href={recorder.loginHref}
              variant="ghost"
              size="icon"
              aria-label="הקלטה בקול שלי (צריך להתחבר)"
              title="כדי להקליט בקול שלכם צריך להתחבר"
            >
              <Mic aria-hidden="true" />
            </ButtonLink>
          )
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label="הגדרות קריאה"
          title="הגדרות קריאה"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings aria-hidden="true" />
        </Button>
      </header>

      <ProgressScrubber index={index} pageCount={pageCount} onJump={jump} />
      <p className="sr-only" aria-live="polite">
        {atEnd ? "סוף הסיפור" : `עמוד ${index + 1} מתוך ${pageCount}`}
      </p>

      {/* Stage */}
      <main
        className={cn("relative min-h-0 flex-1 touch-pan-y", atEnd && "overflow-y-auto")}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        {atEnd ? (
          <EndScreen
            title={book.title}
            discussionQuestions={book.discussionQuestions}
            recommendations={recommendations}
            onReadAgain={readAgain}
            exit={exitControl("lg")}
            creditsBook={book}
            mediaToken={shareToken}
          />
        ) : (
          <div
            key={index}
            className={cn(
              "mystory-reader-spread flex h-full min-h-0 flex-col items-center gap-3 px-4 py-3 sm:px-28",
              sideBySide && "sm:flex-row sm:gap-6",
            )}
          >
            {showImage ? (
              <div
                className={cn(
                  // The frame clips the slow zoom of a living picture.
                  "flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden",
                  sideBySide && "sm:h-full",
                  !motionActive && "mystory-motion-paused",
                )}
                style={showVideo ? { containerType: "size" } : undefined}
              >
                {showVideo ? (
                  <video
                    key={videoSrc}
                    ref={videoRef}
                    src={videoSrc}
                    poster={imageReady ? imageSrc : undefined}
                    role="img"
                    aria-label={pictureAlt}
                    muted
                    loop
                    playsInline
                    autoPlay={motionActive}
                    preload="auto"
                    disablePictureInPicture
                    onError={() => setBrokenVideo(videoSrc)}
                    // Sized to the picture's shape inside the frame; object-cover then cuts away
                    // exactly the bars the vendor added around it.
                    style={
                      imageRatio !== null
                        ? {
                            width: `min(100cqw, ${imageRatio * 100}cqh)`,
                            height: `min(100cqh, ${100 / imageRatio}cqw)`,
                          }
                        : undefined
                    }
                    className={cn(
                      "pointer-events-none select-none bedtime:opacity-90",
                      imageRatio !== null ? "object-cover" : "size-full object-contain",
                    )}
                  />
                ) : (
                  <img
                    src={imageSrc}
                    alt={pictureAlt}
                    draggable={false}
                    decoding="async"
                    onError={() => setBrokenImage(imageSrc)}
                    onLoad={(event) => {
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      if (naturalWidth > 0 && naturalHeight > 0) {
                        setImageShape({
                          src: imageSrc,
                          ratio: naturalWidth / naturalHeight,
                        });
                      }
                    }}
                    className={cn(
                      "size-full select-none object-contain bedtime:opacity-90",
                      animatePictures && "mystory-kenburns",
                    )}
                    style={animatePictures ? kenBurnsStyle(index, currentWordCount) : undefined}
                  />
                )}
              </div>
            ) : null}
            {showText && text.trim() !== "" ? (
              <div
                className={cn(
                  "w-full max-w-3xl overflow-y-auto px-2",
                  showImage ? "mystory-reader-text shrink-0" : "flex min-h-0 flex-1 flex-col justify-center",
                  sideBySide && "sm:max-h-full sm:w-[40%] sm:max-w-md sm:shrink",
                )}
              >
                <StoryText
                  text={text}
                  lang={textLanguage}
                  activeWord={narration.activeWord}
                  onWordTap={timings ? onWordTap : undefined}
                />
              </div>
            ) : null}
            {!showImage && text.trim() === "" ? (
              <p className="m-auto text-7xl" aria-label="עמוד ריק">
                📖
              </p>
            ) : null}
          </div>
        )}

        {/* Page turners, centred on each side. In RTL start is right: previous is right, next is left. */}
        {!atEnd ? (
          <>
            <Button
              variant="outline"
              size="icon-lg"
              className="absolute start-2 top-1/2 z-10 size-16 -translate-y-1/2 p-0 shadow-card max-sm:bg-surface/85 sm:start-5 sm:size-20"
              aria-label="לעמוד הקודם"
              disabled={index === 0}
              onClick={() => turn(-1)}
            >
              <ChevronRight aria-hidden="true" className="size-9 sm:size-11" />
            </Button>
            <Button
              variant="primary"
              size="icon-lg"
              className="absolute end-2 top-1/2 z-10 size-16 -translate-y-1/2 p-0 sm:end-5 sm:size-20"
              aria-label={isLastPage ? "לסוף הסיפור" : "לעמוד הבא"}
              onClick={() => turn(1)}
            >
              <ChevronLeft aria-hidden="true" className="size-9 sm:size-11" />
            </Button>
          </>
        ) : null}

        {notice !== null ? (
          <div
            role="status"
            className="absolute inset-x-3 top-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-3 rounded-lg bg-surface px-4 py-3 text-base shadow-pop"
          >
            <span>{notice}</span>
            {noticeAction === "restart" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  jump(0);
                  setNotice(null);
                  setNoticeAction(null);
                }}
              >
                להתחיל מההתחלה
              </Button>
            ) : null}
          </div>
        ) : null}
      </main>

      {/* A demo clip says so, like demo narration. */}
      {!atEnd && showVideo && current?.videoSource === "mock" ? (
        <MockNotice kind="video" className="mx-3 mb-1 shrink-0 px-3 py-1.5 text-sm" />
      ) : null}

      {/* Narration messages */}
      {!atEnd && isDemoAudio ? (
        <MockNotice kind={speech ? "tts-device" : "tts"} className="mx-3 mb-1 shrink-0 px-3 py-1.5 text-sm" />
      ) : null}
      {!atEnd && (narration.failed || narration.blocked) ? (
        <p role="alert" className="mx-3 mb-1 shrink-0 rounded-md bg-danger-soft px-3 py-1.5 text-sm">
          {narration.failed
            ? "לא הצלחנו להשמיע את ההקראה של העמוד הזה. אפשר להמשיך לקרוא כרגיל."
            : "הדפדפן חסם את ההשמעה. לחצו שוב על כפתור ההשמעה."}
        </p>
      ) : null}

      {/* Bottom controls. In RTL the first item sits on the right: previous is right, next is left. */}
      {!atEnd && recordMode && recorder ? (
        <RecordingPanel
          bookId={book.id}
          shareToken={shareToken}
          canShare={recorder.canShare}
          pageIndex={index}
          pageCount={pageCount}
          recording={activeRecording}
          onChange={(next) => {
            upsertVersion(next);
            setRecordingId(next.id);
            setVoiceId(next.id);
          }}
          onStartNew={() => {
            stopNarration();
            setRecordingId(null);
          }}
          onSaved={() => turn(1)}
          onClose={() => setRecordMode(false)}
        />
      ) : null}
      {!atEnd && !recordMode ? (
        <footer className="flex shrink-0 items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-6">
          <div className="flex min-w-0 flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              {hasAnyAudio ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon-lg"
                    aria-label={narrating ? "להשהות את ההקראה" : "להשמיע את הסיפור"}
                    title={audioSrc ? undefined : "לעמוד הזה אין הקראה"}
                    disabled={!audioSrc}
                    onClick={narration.toggle}
                  >
                    {narrating ? (
                      <Pause aria-hidden="true" className="size-8" />
                    ) : (
                      <Play aria-hidden="true" className="size-8" />
                    )}
                  </Button>
                  <SpeedControl rate={rate} onRate={(value) => updatePrefs({ rate: value })} />
                  <VoicePicker
                    hasOriginal={hasOriginalAudio}
                    versions={versions}
                    value={voiceId}
                    onChange={(id) => {
                      stopNarration();
                      setVoiceId(id);
                    }}
                  />
                </>
              ) : null}
            </div>
            <p className="text-sm text-muted" aria-hidden="true">
              <span dir="ltr">
                {index + 1} / {pageCount}
              </span>
              {hasAnyAudio ? (audioSrc ? null : " · לעמוד הזה אין הקראה") : " · לספר הזה אין הקראה"}
            </p>
          </div>
        </footer>
      ) : null}

      {/* One audio element for the whole book; see useNarration. */}
      <audio ref={audioRef} src={audioSrc || undefined} preload="auto" {...narration.audioEvents} />

      {/* Warm the cache for the next page. */}
      {upcoming?.image ? (
        <img src={mediaUrl(upcoming.image, book.updatedAt, shareToken)} alt="" aria-hidden="true" hidden decoding="async" />
      ) : null}
      {animatePictures && upcoming?.video ? (
        // Only the first bytes (size and first frame), so a page turn starts the clip quickly without fetching it all.
        <video
          key={upcoming.video}
          src={mediaUrl(upcoming.video, book.updatedAt, shareToken)}
          preload="metadata"
          muted
          playsInline
          aria-hidden="true"
          hidden
        />
      ) : null}
      {upcomingAudio ? <audio key={upcomingAudio} src={upcomingAudio} preload="auto" muted hidden /> : null}

      {asleep ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="לילה טוב"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/90 p-6 text-center text-white"
        >
          <p className="text-7xl" aria-hidden="true">
            🌙
          </p>
          <p className="text-4xl font-bold">לילה טוב</p>
          <p className="text-xl opacity-80">הטיימר הסתיים וההקראה נעצרה.</p>
          <Button variant="outline" size="lg" autoFocus onClick={() => setAsleep(false)}>
            להמשיך לקרוא
          </Button>
        </div>
      ) : null}

      {choosing && !atEnd ? (
        <StartScreen
          title={book.title}
          author={book.author}
          cover={mediaUrl(book.coverImage, book.updatedAt, shareToken)}
          resumePage={index}
          onRead={() => setChoosing(false)}
          onListen={
            hasAnyAudio
              ? () => {
                  setChoosing(false);
                  // A tap starts it, so the browser allows the sound.
                  if (audioSrc && !narrating) toggleNarration();
                }
              : undefined
          }
          download={downloadControl}
          detailsHref={resolvedExitHref}
        />
      ) : null}

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontStep={fontStep}
        onFontStep={(step) => updatePrefs({ fontStep: clamp(step, 0, FONT_SIZES_REM.length - 1) })}
        textLayout={textLayout}
        onTextLayout={(value) => updatePrefs({ textLayout: value })}
        liveImages={liveImages}
        onLiveImages={(value) => updatePrefs({ liveImages: value })}
        reducedMotion={reducedMotion}
        hasAudio={hasAnyAudio}
        rate={rate}
        onRate={(value) => updatePrefs({ rate: value })}
        autoAdvance={autoAdvance}
        onAutoAdvance={(value) => updatePrefs({ autoAdvance: value })}
        sleepRemaining={sleep.remaining}
        onSleepStart={(minutes) => {
          sleep.start(minutes);
          showNotice(`טיימר השינה הופעל ל-${minutes} דקות.`);
          setSettingsOpen(false);
        }}
        onSleepCancel={sleep.cancel}
      />
    </div>
  );
}
