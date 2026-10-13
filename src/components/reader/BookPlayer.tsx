"use client";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Languages,
  Maximize,
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
  progressPercent,
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
import { ReaderSettings, rateLabel } from "./ReaderSettings";
import { StoryText } from "./StoryText";
import { useDeviceVoice } from "./useDeviceVoice";
import { useNarration } from "./useNarration";
import { useSleepTimer } from "./useSleepTimer";

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
  /** Report one reading to POST /api/views/<bookId>, once per browser session. Published books only. */
  countView?: boolean;
  className?: string;
}

const READER_CSS = `
@keyframes mystory-reader-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.mystory-reader-spread { animation: mystory-reader-page-in 0.25s ease-out; }
.mystory-reader-text { max-height: 45%; }
@media (orientation: landscape) and (max-height: 560px) {
  .mystory-reader-spread { flex-direction: row; }
  .mystory-reader-text { max-height: 100%; width: 50%; }
}
@media (prefers-reduced-motion: reduce) { .mystory-reader-spread { animation: none; } }
`;

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
  const hasAnyAudio = useMemo(() => book.pages.some((entry) => !!entry.audio), [book]);
  // `shareToken` is set only for an unpublished book opened through its share link;
  // its media is not public, so every media URL carries the token.
  const audioSrc = current?.audio ? mediaUrl(current.audio, book.updatedAt, shareToken) : "";
  // The narration is of the translation: its word timings do not fit the original text.
  const timings = useMemo(() => (current && !inOriginal ? usableTimings(current) : null), [current, inOriginal]);
  const isLastPage = index === pageCount - 1;

  const handlePageEnded = useCallback(() => {
    if (!autoAdvance) return;
    clearAdvance();
    // A short breath between pages, so the turn does not feel abrupt.
    advanceTimer.current = window.setTimeout(() => turn(1), 700);
  }, [autoAdvance, clearAdvance, turn]);

  // The demo recording is silent. When the device has a Hebrew voice, it reads the page instead.
  const isDemoAudio = !!current?.audio && current.audioSource === "mock";
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
    if (settingsOpen || asleep || pageCount === 0 || isTypingTarget(event.target)) return;
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
    const action = swipeToAction(event.clientX - begin.x, event.clientY - begin.y);
    if (!action) return;
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
  const showImage = imageSrc !== "" && brokenImage !== imageSrc;
  const text = current ? (inOriginal ? originalText : pageDisplayText(current, nikudOn)) : "";
  const textLanguage = inOriginal && originalLanguage ? originalLanguage : bookLanguage(book);
  const title = (showOriginal && book.credits?.originalTitle) || book.title;
  const otherLanguage = showOriginal ? bookLanguage(book) : originalLanguage;
  const percent = progressPercent(index, pageCount);

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

      <div
        role="progressbar"
        aria-label="התקדמות בספר"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 shrink-0 bg-surface-2"
      >
        <div
          className="h-full rounded-e-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
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
            className="mystory-reader-spread flex h-full min-h-0 flex-col items-center gap-3 px-4 py-3"
          >
            {showImage ? (
              <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
                <img
                  src={imageSrc}
                  alt={current?.imageAlt?.trim() || `איור לעמוד ${index + 1}`}
                  draggable={false}
                  decoding="async"
                  onError={() => setBrokenImage(imageSrc)}
                  className="size-full select-none object-contain bedtime:opacity-90"
                />
              </div>
            ) : null}
            {text.trim() !== "" ? (
              <div
                className={cn(
                  "w-full max-w-3xl overflow-y-auto px-2",
                  showImage ? "mystory-reader-text shrink-0" : "flex min-h-0 flex-1 flex-col justify-center",
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
      {!atEnd ? (
        <footer className="flex shrink-0 items-center justify-center gap-4 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:gap-10 sm:px-6">
          <Button
            variant="outline"
            size="lg"
            className="max-sm:size-touch-lg max-sm:px-0"
            aria-label="לעמוד הקודם"
            disabled={index === 0}
            onClick={() => turn(-1)}
          >
            <ChevronRight aria-hidden="true" className="size-8" />
            <span className="max-sm:hidden">הקודם</span>
          </Button>

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
                  <button
                    type="button"
                    className="inline-flex min-h-touch items-center rounded-full bg-secondary-soft px-3 text-sm font-semibold"
                    aria-label={`מהירות ההקראה: ${rateLabel(rate)}. לחיצה מחליפה מהירות.`}
                    onClick={() => updatePrefs({ rate: rate === 0.75 ? 1 : rate === 1 ? 1.25 : 0.75 })}
                  >
                    {rateLabel(rate)}
                  </button>
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

          <Button
            variant="primary"
            size="lg"
            className="max-sm:size-touch-lg max-sm:px-0"
            aria-label={isLastPage ? "לסוף הסיפור" : "לעמוד הבא"}
            onClick={() => turn(1)}
          >
            <span className="max-sm:hidden">{isLastPage ? "סוף" : "הבא"}</span>
            <ChevronLeft aria-hidden="true" className="size-8" />
          </Button>
        </footer>
      ) : null}

      {/* One audio element for the whole book; see useNarration. */}
      <audio ref={audioRef} src={audioSrc || undefined} preload="auto" {...narration.audioEvents} />

      {/* Warm the cache for the next page. */}
      {upcoming?.image ? (
        <img src={mediaUrl(upcoming.image, book.updatedAt, shareToken)} alt="" aria-hidden="true" hidden decoding="async" />
      ) : null}
      {upcoming?.audio ? (
        <audio key={upcoming.audio} src={mediaUrl(upcoming.audio, book.updatedAt, shareToken)} preload="auto" muted hidden />
      ) : null}

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

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontStep={fontStep}
        onFontStep={(step) => updatePrefs({ fontStep: clamp(step, 0, FONT_SIZES_REM.length - 1) })}
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
