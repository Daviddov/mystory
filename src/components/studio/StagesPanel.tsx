"use client";

import {
  BookText,
  Check,
  ChevronDown,
  ClipboardList,
  Clapperboard,
  ImagePlus,
  Mic,
  Palette,
  Paintbrush,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card, Chip, Field, Input, Textarea, type ChipProps } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  ANIMATION_MOTIONS,
  ANIMATION_NOTES_MAX,
  DEFAULT_ANIMATION_MOTION,
  DEFAULT_NARRATION_STYLE,
  ILLUSTRATION_STYLES,
  NARRATION_STYLES,
  RULE_PACKS,
} from "@/lib/generation/presets";
import {
  estimateAnimation,
  estimateDetails,
  estimateHero,
  estimateNarration,
  estimateNikud,
  estimatePictures,
  estimateStory,
  estimateStyle,
  costLine,
  sumEstimates,
  totalLine,
  type CostContext,
  type CostEstimate,
} from "@/lib/generation/costs";
import { mediaUrl } from "@/lib/media/url";
import { CostLine } from "./CostLine";
import {
  animatePageWithAi,
  attachPageClip,
  fetchBook,
  removePageClip,
  StudioApiError,
  type GridLayout,
} from "@/lib/studio/client";
import { DEFAULT_ILLUSTRATION_STYLE, IMAGE_ACCEPT, MAX_HERO_DESCRIPTION } from "@/lib/studio/shared";
import type { NarrationInfo } from "@/lib/studio/client";
import { EXPECTED_SECONDS, type BusyInput } from "@/lib/studio/progress";
import type { BookHero, BookWithPages } from "@/lib/types";
import {
  AnimationPreview,
  PageClipThumb,
  DetailsPreview,
  EMPTY_CREATED,
  HeroPreview,
  NarrationPreview,
  NikudPreview,
  PicturesPreview,
  StoryPreview,
  StylePreview,
  type CreatedPage,
  type CreatedSummary,
} from "./StagePreviews";
import type { DetailsStatus } from "./types";
import type { EditorNotice } from "./types";

export interface StageCounts {
  pages: number;
  /** Pages that have text. */
  withText: number;
  withImage: number;
  withNikud: number;
  withAudio: number;
  /** Pages with text whose audio matches the text (or is a recording). Defaults to withAudio. */
  withFreshAudio?: number;
  /** Characters of all page text (for cost estimates). */
  textChars?: number;
  /** Characters of the pages that have text and no narration yet. */
  audioMissingChars?: number;
}

/** "missing": only pages without up-to-date narration. "all": every page with text again (the editor confirms first). */
export interface NarrateAllOptions {
  style: string;
  notes: string;
  voice?: string;
  scope: "missing" | "all";
}

export interface StagesPanelProps {
  bookId: string;
  /** Cache-busting version for media URLs. */
  version?: string;
  hero: BookHero | undefined;
  counts: StageCounts;
  /** Providers and prices (from the server). Without it no cost lines are shown. */
  costs?: CostContext;
  /** False while the book is locked or another action is running. */
  disabled: boolean;
  /** Pages (zero-based) that have an illustration, for the animation stage. */
  illustratedPages: number[];
  onHeroChange: (hero: BookHero | undefined) => void;
  onHeroGenerate: (description: string, style: string) => void;
  onHeroUpload: (file: File) => void;
  onWriteStory: (options: { idea: string; heroName: string; heroGender: "boy" | "girl" }) => void;
  onPasteStory: () => void;
  onGoToPages: () => void;
  /** Opens one page (zero-based) in the pages tab. Falls back to onGoToPages. */
  onGoToPage?: (index: number) => void;
  /** What was already created, shown inside each stage. Without it the previews say nothing exists yet. */
  created?: CreatedSummary;
  /** Switches to the book details tab (the manual side of stage 8). */
  onGoToDetails: () => void;
  /** How complete the details are. */
  details: DetailsStatus;
  /** Fills the details from the story with AI; `replace` also replaces details that were already filled (never credits). */
  onAutoDetails: (options: { replace: boolean }) => void;
  onUploadImages: () => void;
  /** Illustrates the pages that have text and no picture, with grid pictures. */
  onIllustrateGrid: (options: { layout: GridLayout; notes: string }) => void;
  onNikudAll: () => void;
  /** Resolves with styleNotesIgnored when the voice could not take the free-text notes. */
  onNarrateAll: (options: NarrateAllOptions) => Promise<{ styleNotesIgnored?: boolean } | void> | void;
  /** Voices of the active provider; the voice picker shows only when there are some. */
  narrationInfo?: Pick<NarrationInfo, "voices" | "defaultVoice" | "notesHonoured">;
  /** Plays a sample sentence in a voice and style (uses a little TTS quota). Resolves when it is playing. */
  onSampleVoice?: (options: { voice?: string; style: string }) => Promise<void>;
  /** Saves the pending edits; false when they could not be saved. */
  onFlush: () => Promise<boolean>;
  /** Takes over a book the server changed on its own (a clip added or removed), so later saves are based on it. */
  onServerBook?: (book: BookWithPages) => void;
  onNotice: (notice: EditorNotice) => void;
  onBusy: (busy: BusyInput) => void;
  /** Asks the user before something that replaces their own work. Without it the action runs at once. */
  onConfirm?: (request: { title: string; description: string; confirmLabel: string; run: () => void }) => void;
}

type StageState = "empty" | "partial" | "done";

const STATE_LABEL: Record<StageState, string> = { empty: "עוד לא התחיל", partial: "בתהליך", done: "מוכן" };
const STATE_TONE: Record<StageState, NonNullable<ChipProps["tone"]>> = { empty: "neutral", partial: "warning", done: "success" };

function stateOf(done: number, total: number): StageState {
  if (total <= 0 || done <= 0) return "empty";
  return done >= total ? "done" : "partial";
}

/** Short names for the progress stepper. */
const STEP_NAMES: Record<number, string> = {
  1: "דמות",
  2: "סיפור",
  3: "סגנון",
  4: "תמונות",
  5: "הקראה",
  6: "ניקוד",
  7: "הנפשה",
  8: "פרטים",
};

function scrollToStage(number: number) {
  const element = document.getElementById(`stage-${number}`);
  element?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function StageCard({
  number,
  icon: Icon,
  title,
  description,
  state,
  summary,
  open,
  onToggle,
  preview,
  manual,
  ai,
  cost,
}: {
  number: number;
  icon: LucideIcon;
  title: string;
  description: string;
  state: StageState;
  summary: string;
  open: boolean;
  onToggle: () => void;
  /** The created result; receives whether the card is expanded (bigger previews). */
  preview: (open: boolean) => ReactNode;
  manual: ReactNode;
  ai: ReactNode;
  /** Estimated cost of the AI action, shown under it. */
  cost?: ReactNode;
}) {
  const headingId = `stage-${number}-title`;
  const bodyId = `stage-${number}-body`;
  return (
    <Card as="section" id={`stage-${number}`} aria-labelledby={headingId} padding="sm" className="flex scroll-mt-4 flex-col gap-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 basis-36 flex-col">
          <h2 id={headingId} className="text-lg font-bold leading-snug">
            {number}. {title}
          </h2>
          <p className="text-sm text-muted">{summary}</p>
        </div>
        <Chip tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Chip>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "סגירת" : "עריכת"} שלב ${number}: ${title}`}
          onClick={onToggle}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border-2 border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2 sm:px-4"
        >
          <span className="hidden sm:inline">{open ? "סגירה" : "עריכה"}</span>
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <div className="min-w-0">{preview(open)}</div>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-3">
        <p className="text-sm text-muted">{description}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
            <h3 className="font-semibold">בעצמכם</h3>
            {manual}
          </div>
          <div className="flex flex-col gap-3 rounded-md bg-primary-soft p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Sparkles aria-hidden="true" className="size-4" />
              בעזרת בינה מלאכותית
            </h3>
            {ai}
            {cost}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * The eight stages of a book. Each one stands alone: do it by hand or with AI,
 * edit the result afterwards, and skip or redo it without touching the others.
 * (A stage never blocks another; it only says what it needs.)
 */
export function StagesPanel(props: StagesPanelProps) {
  const {
    bookId,
    version,
    hero,
    counts,
    costs,
    disabled,
    illustratedPages,
    onHeroChange,
    onHeroGenerate,
    onHeroUpload,
    onWriteStory,
    onPasteStory,
    onGoToPages,
    onGoToPage,
    created = EMPTY_CREATED,
    onGoToDetails,
    details,
    onAutoDetails,
    onUploadImages,
    onIllustrateGrid,
    onNikudAll,
    onNarrateAll,
    narrationInfo,
    onSampleVoice,
    onFlush,
    onServerBook,
    onNotice,
    onBusy,
    onConfirm,
  } = props;

  const heroFile = useRef<HTMLInputElement>(null);
  const [idea, setIdea] = useState("");
  const [heroName, setHeroName] = useState("");
  const [heroGender, setHeroGender] = useState<"boy" | "girl">("girl");
  const [gridLayout, setGridLayout] = useState<GridLayout>("3x3");
  const [gridNotes, setGridNotes] = useState("");
  const [narrationIgnored, setNarrationIgnored] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [replaceDetails, setReplaceDetails] = useState(false);

  const description = hero?.description ?? "";
  const style = hero?.style ?? DEFAULT_ILLUSTRATION_STYLE;
  const heroImage = mediaUrl(hero?.image, version);
  const changeHero = (patch: Partial<BookHero>) =>
    onHeroChange({ ...hero, description, style, ...patch });
  const packs = hero?.packs ?? [];
  const togglePack = (slug: string) =>
    changeHero({ packs: packs.includes(slug) ? packs.filter((entry) => entry !== slug) : [...packs, slug] });
  const narrationStyle = hero?.narrationStyle ?? DEFAULT_NARRATION_STYLE;
  const voices = narrationInfo?.voices ?? [];
  // A stored voice the provider no longer offers falls back to the default.
  const narrationVoice =
    hero?.narrationVoice && voices.some((v) => v.id === hero.narrationVoice)
      ? hero.narrationVoice
      : (narrationInfo?.defaultVoice ?? voices[0]?.id);

  const missingImages = counts.withText - Math.min(counts.withText, counts.withImage);
  // Pages whose narration is missing or no longer matches the text.
  const narrationMissing = Math.max(0, counts.withText - Math.min(counts.withText, counts.withFreshAudio ?? counts.withAudio));
  const runNarration = async (scope: NarrateAllOptions["scope"]) => {
    setNarrationIgnored(false);
    const result = await onNarrateAll({
      style: narrationStyle,
      notes: hero?.narrationNotes ?? "",
      ...(narrationVoice ? { voice: narrationVoice } : {}),
      scope,
    });
    if (result && result.styleNotesIgnored) setNarrationIgnored(true);
  };

  // Clips live on the server book. They follow their picture (the server keeps a clip with its
  // image when pages move), so they are keyed by image path and mapped onto the editor's order.
  const [serverClips, setServerClips] = useState<Map<string, { video: string; own: boolean }> | null>(null);
  const takeClips = useCallback((book: BookWithPages) => {
    const next = new Map<string, { video: string; own: boolean }>();
    // Clips with no videoSource were uploaded by the user, not made by the AI.
    for (const page of book.pages) if (page.image && page.video) next.set(page.image, { video: page.video, own: !page.videoSource });
    setServerClips(next);
  }, []);
  /** Re-reads the clips after a stage-7 action and hands the changed book to the editor. */
  const refreshClips = useCallback(async () => {
    try {
      const book = await fetchBook(bookId);
      takeClips(book);
      onServerBook?.(book);
    } catch {
      // The status is informative only; the actions report their own errors.
    }
  }, [bookId, takeClips, onServerBook]);
  const imagesKey = created.pages.map((page) => page.image ?? "").join("|");
  useEffect(() => {
    let cancelled = false;
    fetchBook(bookId).then(
      (book) => {
        if (!cancelled) takeClips(book);
      },
      () => {
        // The status is informative only; the actions report their own errors.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bookId, takeClips, imagesKey]);
  const { clipPaths, ownClips } = useMemo(() => {
    const paths = new Map<number, string>();
    const own = new Set<number>();
    for (const page of created.pages) {
      const clip = page.image ? serverClips?.get(page.image) : undefined;
      if (!clip) continue;
      paths.set(page.index, clip.video);
      if (clip.own) own.add(page.index);
    }
    return { clipPaths: paths, ownClips: own };
  }, [created.pages, serverClips]);
  const previewPages = useMemo(
    // Until the server answered, the editor's own copy is the best guess; afterwards the server decides.
    () => created.pages.map((page) => ({ ...page, video: serverClips ? clipPaths.get(page.index) : page.video })),
    [created.pages, clipPaths, serverClips],
  );

  // Open/closed cards (this component only). Unset: finished stages are collapsed, the rest open.
  const [openOverride, setOpenOverride] = useState<Record<number, boolean>>({});
  const stageStates: Record<number, StageState> = {
    1: hero?.image ? "done" : hero?.description.trim() ? "partial" : "empty",
    2: counts.withText === 0 ? "empty" : "done",
    3: hero?.style ? "done" : "empty",
    4: stateOf(counts.withImage, counts.pages),
    5: stateOf(counts.withAudio, counts.withText),
    6: stateOf(counts.withNikud, counts.withText),
    7: stateOf(illustratedPages.filter((page) => clipPaths.has(page)).length, illustratedPages.length),
    8: stateOf(details.done, details.total),
  };
  const isOpen = (n: number) => openOverride[n] ?? stageStates[n] !== "done";
  const toggle = (n: number) => setOpenOverride((current) => ({ ...current, [n]: !(current[n] ?? stageStates[n] !== "done") }));
  const goToStage = (n: number) => {
    setOpenOverride((current) => ({ ...current, [n]: true }));
    requestAnimationFrame(() => scrollToStage(n));
  };
  const doneSteps = Object.values(stageStates).filter((state) => state === "done").length;
  const openPage = (index: number) => (onGoToPage ?? onGoToPages)(index);

  // One suggestion for what to do next; nothing is ever locked behind it.
  const next: { stage: number; text: string } | null =
    counts.withText === 0
      ? { stage: 2, text: "כתיבת הסיפור" }
      : !hero?.image
        ? { stage: 1, text: "יצירת הגיבור" }
        : missingImages > 0
          ? { stage: 4, text: missingImages === 1 ? "איור עמוד אחד" : `איור ${missingImages} עמודים` }
          : counts.withAudio < counts.withText
            ? { stage: 5, text: "הקראה" }
            : counts.withNikud < counts.withText
              ? { stage: 6, text: "ניקוד" }
              : details.missing.length > 0
                ? { stage: 8, text: "השלמת פרטי הספר" }
                : null;

  // Estimated costs (only when the server told us the providers and prices).
  const textChars = counts.textChars ?? counts.withText * 200;
  const estimates: Record<"hero" | "story" | "style" | "pictures" | "narration" | "nikud" | "animation" | "details", CostEstimate> | null = costs
    ? {
        hero: estimateHero(costs, { hasDescription: description.trim().length > 0, storyChars: textChars }),
        story: estimateStory(costs),
        style: estimateStyle(),
        pictures: estimatePictures(costs, { missingPages: missingImages, layout: gridLayout === "4x4" ? "4x4" : "3x3", textChars }),
        narration: estimateNarration(costs, { chars: counts.audioMissingChars ?? (counts.withText - counts.withAudio) * 200 }),
        nikud: estimateNikud(costs),
        animation: estimateAnimation(costs, { clips: 1 }),
        details: estimateDetails(costs, { textChars }),
      }
    : null;
  // Everything still to do: a finished stage counts 0, and so does a stage that needs no AI.
  const todo = estimates
    ? sumEstimates([
        ...(heroImage ? [] : [estimates.hero]),
        ...(counts.withText > 0 ? [] : [estimates.story]),
        estimates.pictures,
        ...(counts.withText > counts.withAudio ? [estimates.narration] : []),
        ...(counts.withText > counts.withNikud ? [estimates.nikud] : []),
      ])
    : null;
  const costLineFor = (key: keyof NonNullable<typeof estimates>) =>
    costs && estimates ? <CostLine estimate={estimates[key]} costs={costs} /> : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-4">
      <nav aria-label="התקדמות בשלבי היצירה" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="font-semibold">
            {doneSteps} מתוך 8 שלבים מוכנים
          </p>
          <p className="text-sm text-muted">כל שלב עצמאי: בעצמכם או בבינה מלאכותית, בכל סדר.</p>
        </div>
        <ol className="grid grid-cols-8 gap-1">
          {Object.entries(STEP_NAMES).map(([key, name]) => {
            const n = Number(key);
            const state = stageStates[n];
            return (
              <li key={n} className="min-w-0">
                <button
                  type="button"
                  onClick={() => goToStage(n)}
                  aria-label={`שלב ${n}: ${name}, ${STATE_LABEL[state]}`}
                  data-state={state}
                  className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md px-0.5 hover:bg-surface-2"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border-2 text-sm font-bold",
                      state === "done" && "border-success bg-success text-primary-foreground",
                      state === "partial" && "border-warning bg-warning-soft",
                      state === "empty" && "border-dashed border-border-strong text-muted",
                    )}
                  >
                    {state === "done" ? <Check className="size-4" /> : n}
                  </span>
                  <span aria-hidden="true" className="hidden truncate text-xs text-muted sm:block">
                    {name}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(doneSteps / 8) * 100}%` }} />
        </div>
        {costs && todo ? (
          <p className="text-sm text-muted" role="status" data-testid="cost-total">
            <strong className="text-foreground">{totalLine(todo, costs)}</strong> (רק מה שעוד לא נעשה, בלי ניסיונות חוזרים).
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 rounded-md bg-primary-soft px-3 py-1 font-semibold" data-testid="next-step">
          {next ? (
            <>
              <span>הבא בתור: {next.text}</span>
              <button
                type="button"
                onClick={() => goToStage(next.stage)}
                aria-label={`מעבר לשלב ${next.stage}`}
                className="min-h-11 rounded-full px-3 text-sm font-semibold text-secondary underline"
              >
                לשלב {next.stage}
              </button>
            </>
          ) : (
            <span>הספר מוכן. אפשר לעבור לתצוגה מקדימה ולפרסום.</span>
          )}
        </p>
      </nav>

      {/* 1. Character */}
      <StageCard
        number={1}
        icon={UserRound}
        title="יצירת הדמות"
        description="תיאור ותמונת ייחוס, כדי שהגיבור ייראה אותו דבר בכל עמוד."
        state={stageStates[1]}
        open={isOpen(1)}
        onToggle={() => toggle(1)}
        preview={(open) => <HeroPreview imageUrl={heroImage} description={description} large={open} />}
        summary={hero?.image ? "יש תמונת גיבור" : hero?.description.trim() ? "יש תיאור, אין תמונה" : "אין גיבור"}
        cost={costLineFor("hero")}
        manual={
          <>
            <Field label="איך הגיבור נראה?" htmlFor="stage-hero-description">
              <Textarea
                id="stage-hero-description"
                rows={3}
                maxLength={MAX_HERO_DESCRIPTION}
                value={description}
                onChange={(event) => changeHero({ description: event.target.value })}
                placeholder="למשל: ילדה בת שש עם צמה ג'ינג'ית, חולצה צהובה ומגפיים אדומים"
                disabled={disabled}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => heroFile.current?.click()} disabled={disabled}>
                <Upload aria-hidden="true" className="size-4" />
                העלאת תמונת גיבור
              </Button>
              {hero ? (
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => onHeroChange(undefined)} disabled={disabled}>
                  <Trash2 aria-hidden="true" className="size-4" />
                  הסרת הגיבור
                </Button>
              ) : null}
              <input
                ref={heroFile}
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onHeroUpload(file);
                }}
              />
            </div>
          </>
        }
        ai={
          <>
            <p className="text-sm">
              {description.trim() ? "נצייר לפי התיאור שכתבתם." : "בלי תיאור נכתוב אותו לפי הסיפור (צריך טקסט בעמודים)."}
            </p>
            <div>
              <Button variant={heroImage ? "outline" : "primary"} onClick={() => onHeroGenerate(description.trim(), style)} disabled={disabled}>
                <Sparkles aria-hidden="true" className="size-5" />
                {heroImage ? "יצירת הגיבור מחדש" : "יצירת תמונת הגיבור"}
              </Button>
            </div>
          </>
        }
      />

      {/* 2. Story */}
      <StageCard
        number={2}
        icon={BookText}
        title="כתיבת הסיפור"
        description="הטקסט של העמודים. ברירת המחדל: חרוזים וקצב בסגנון ד״ר סוס."
        state={stageStates[2]}
        open={isOpen(2)}
        onToggle={() => toggle(2)}
        preview={() => <StoryPreview pages={created.pages} onSeeAll={onGoToPages} />}
        summary={counts.withText === 0 ? "אין טקסט" : `${counts.withText} עמודים עם טקסט`}
        cost={costLineFor("story")}
        manual={
          <>
            <p className="text-sm">הדביקו סיפור שלם והוא יתחלק לעמודים, או כתבו בכל עמוד.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onPasteStory} disabled={disabled}>
                הדבקת סיפור שלם
              </Button>
              <Button variant="ghost" onClick={onGoToPages}>
                כתיבה בעמודים
              </Button>
            </div>
          </>
        }
        ai={
          <>
            <Field label="על מה הסיפור?" htmlFor="stage-idea" hint="כמה מילים מספיקות. הכותב משלים עלילה וחרוזים.">
              <Textarea
                id="stage-idea"
                rows={2}
                maxLength={300}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="למשל: ארנבת שלא רוצה ללכת לגן"
                disabled={disabled}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="שם הגיבור (לא חובה)" htmlFor="stage-hero-name">
                <Input
                  id="stage-hero-name"
                  value={heroName}
                  maxLength={30}
                  onChange={(event) => setHeroName(event.target.value)}
                  disabled={disabled}
                />
              </Field>
              <div className="flex gap-2" role="group" aria-label="בן או בת">
                {(["girl", "boy"] as const).map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    aria-pressed={heroGender === gender}
                    onClick={() => setHeroGender(gender)}
                    disabled={disabled}
                    className={cn(
                      "min-h-touch rounded-full border-2 px-4 font-medium",
                      heroGender === gender ? "border-primary bg-surface" : "border-border hover:bg-surface",
                    )}
                  >
                    {gender === "girl" ? "בת" : "בן"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Button
                variant={counts.withText > 0 ? "outline" : "primary"}
                onClick={() => onWriteStory({ idea, heroName, heroGender })}
                disabled={disabled || idea.trim().length < 3}
              >
                <Wand2 aria-hidden="true" className="size-5" />
                כתיבת הסיפור
              </Button>
            </div>
            {counts.withText > 0 ? <p className="text-sm text-muted">יחליף את הטקסט הקיים, אחרי אישור.</p> : null}
          </>
        }
      />

      {/* 3. Style */}
      <StageCard
        number={3}
        icon={Palette}
        title="הסגנון"
        description="איך נראים האיורים. נשמר בספר ומשפיע על האיורים הבאים."
        state={stageStates[3]}
        open={isOpen(3)}
        onToggle={() => toggle(3)}
        preview={() => <StylePreview style={style} chosen={!!hero?.style} packs={packs} notes={hero?.styleNotes} />}
        summary={ILLUSTRATION_STYLES.find((option) => option.slug === style)?.label ?? style}
        cost={costLineFor("style")}
        manual={
          <p className="text-sm">
            הסגנון משפיע רק על איורים שנוצרים בבינה מלאכותית. אם אתם מעלים איורים משלכם, אפשר לדלג.
          </p>
        }
        ai={
          <>
            {(
              [
                ["general", "כללי"],
                ["jewish", "יהודי ותורני"],
              ] as const
            ).map(([group, heading]) => (
              <div key={group} role="group" aria-label={`סגנון האיור: ${heading}`} className="flex flex-col gap-2">
                <p className="text-sm font-semibold">{heading}</p>
                <div className="flex flex-wrap gap-2">
                  {ILLUSTRATION_STYLES.filter((option) => option.group === group).map((option) => (
                    <button
                      key={option.slug}
                      type="button"
                      aria-pressed={style === option.slug}
                      title={option.description}
                      onClick={() => changeHero({ style: option.slug })}
                      disabled={disabled}
                      className={cn(
                        "flex min-h-touch min-w-40 flex-1 basis-48 flex-col items-start rounded-md border-2 px-3 py-2 text-start",
                        style === option.slug ? "border-primary bg-surface" : "border-border hover:bg-surface",
                      )}
                    >
                      <span className="font-medium">
                        <span aria-hidden="true">{option.emoji} </span>
                        {option.label}
                      </span>
                      <span className="text-sm text-muted">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div role="group" aria-label="כללים נוספים" className="flex flex-col gap-2">
              <p className="text-sm font-semibold">כללים נוספים (אפשר כמה)</p>
              <div className="flex flex-wrap gap-2">
                {RULE_PACKS.map((pack) => (
                  <button
                    key={pack.slug}
                    type="button"
                    aria-pressed={packs.includes(pack.slug)}
                    title={pack.description}
                    onClick={() => togglePack(pack.slug)}
                    disabled={disabled}
                    className={cn(
                      "min-h-touch rounded-full border-2 px-4 font-medium",
                      packs.includes(pack.slug) ? "border-primary bg-surface" : "border-border hover:bg-surface",
                    )}
                  >
                    <span aria-hidden="true">{pack.emoji} </span>
                    {pack.label}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="הנחיות משלכם (לא חובה)"
              htmlFor="stage-style-notes"
              hint="נוסף על הסגנון, לא במקומו. למשל: צבעים חמים."
            >
              <Textarea
                id="stage-style-notes"
                rows={2}
                maxLength={600}
                value={hero?.styleNotes ?? ""}
                onChange={(event) => changeHero({ styleNotes: event.target.value })}
                disabled={disabled}
              />
            </Field>
          </>
        }
      />

      {/* 4. Pictures */}
      <StageCard
        number={4}
        icon={ImagePlus}
        title="התמונות"
        description="איור לכל עמוד."
        state={stageStates[4]}
        open={isOpen(4)}
        onToggle={() => toggle(4)}
        preview={() => <PicturesPreview pages={created.pages} version={version} onOpen={openPage} />}
        summary={`${counts.withImage} מתוך ${counts.pages} עמודים עם תמונה`}
        cost={costLineFor("pictures")}
        manual={
          <>
            <p className="text-sm">אפשר כמה בבת אחת: כל תמונה הופכת לעמוד. אפשר גם לגרור לעמודים.</p>
            <div>
              <Button variant="outline" onClick={onUploadImages} disabled={disabled}>
                <Upload aria-hidden="true" className="size-4" />
                העלאת תמונות
              </Button>
            </div>
          </>
        }
        ai={
          <>
            <p className="text-sm">תמונה אחת עם כמה איורים, שנחתכת לעמודים. צריך טקסט בעמוד וגיבור (שלב 1).</p>
            <div role="group" aria-label="גודל הרשת" className="flex flex-wrap gap-2">
              {(
                [
                  ["3x3", "רשת 3×3"],
                  ["4x4", "רשת 4×4"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={gridLayout === value}
                  onClick={() => setGridLayout(value)}
                  disabled={disabled}
                  className={cn(
                    "min-h-touch rounded-full border-2 px-4 font-medium",
                    gridLayout === value ? "border-primary bg-surface" : "border-border hover:bg-surface",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">
              {gridLayout === "3x3"
                ? "9 איורים בתמונה: זול ואחיד."
                : "16 איורים בתמונה: זול עוד יותר, אבל כל איור קטן יותר."}
            </p>
            <Field label="הנחיות לאיור הזה (לא חובה)" htmlFor="stage-grid-notes" hint="נוסף על הסגנון. תקף רק לפעם הזאת.">
              <Textarea
                id="stage-grid-notes"
                rows={2}
                maxLength={600}
                value={gridNotes}
                onChange={(event) => setGridNotes(event.target.value)}
                disabled={disabled}
              />
            </Field>
            <div>
              <Button variant={missingImages > 0 ? "primary" : "outline"} onClick={() => onIllustrateGrid({ layout: gridLayout, notes: gridNotes })} disabled={disabled || missingImages === 0}>
                <Paintbrush aria-hidden="true" className="size-5" />
                {missingImages > 0
                  ? missingImages === 1
                    ? "איור העמוד שאין לו תמונה"
                    : `איור ${missingImages} עמודים שאין להם תמונה`
                  : counts.withText === 0
                    ? "אין עמודים עם טקסט לאייר"
                    : "לכל העמודים עם טקסט יש תמונה"}
              </Button>
            </div>
          </>
        }
      />

      {/* 5. Narration */}
      <StageCard
        number={5}
        icon={Mic}
        title="הקראה"
        description="קול שמקריא כל עמוד."
        state={stageStates[5]}
        open={isOpen(5)}
        onToggle={() => toggle(5)}
        preview={() => (
          <NarrationPreview
            pages={created.pages}
            version={version}
            styleSlug={narrationStyle}
            voiceLabel={voices.find((voice) => voice.id === narrationVoice)?.label}
          />
        )}
        summary={`${counts.withAudio} מתוך ${counts.withText} עמודים מוקראים`}
        cost={costLineFor("narration")}
        manual={
          <>
            <p className="text-sm">הקליטו או העלו שמע בלשונית העמודים. הקלטה שלכם לא נדרסת.</p>
            <div>
              <Button variant="outline" onClick={onGoToPages}>
                להקלטה בעמודים
              </Button>
            </div>
          </>
        }
        ai={
          <>
            <p className="text-sm">קול מלאכותי. בחרו סגנון וקול, ואז הקראה לעמודים החסרים או הקראה מחדש לכל הספר.</p>
            <div role="group" aria-label="סגנון ההקראה" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {NARRATION_STYLES.map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  aria-pressed={narrationStyle === option.slug}
                  title={option.description}
                  onClick={() => changeHero({ narrationStyle: option.slug })}
                  disabled={disabled}
                  className={cn(
                    "flex min-h-touch flex-col items-start rounded-md border-2 px-3 py-2 text-start",
                    narrationStyle === option.slug ? "border-primary bg-surface" : "border-border hover:bg-surface",
                  )}
                >
                  <span className="font-medium">
                    <span aria-hidden="true">{option.emoji} </span>
                    {option.label}
                  </span>
                  <span className="text-sm text-muted">{option.description}</span>
                </button>
              ))}
            </div>
            {voices.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div role="group" aria-label="קול ההקראה" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {voices.map((voice) => (
                    <button
                      key={voice.id}
                      type="button"
                      aria-pressed={narrationVoice === voice.id}
                      title={voice.description}
                      onClick={() => changeHero({ narrationVoice: voice.id })}
                      disabled={disabled}
                      className={cn(
                        "flex min-h-touch flex-col items-start rounded-md border-2 px-3 py-2 text-start",
                        narrationVoice === voice.id ? "border-primary bg-surface" : "border-border hover:bg-surface",
                      )}
                    >
                      <span className="font-medium">{voice.label}</span>
                      <span className="text-sm text-muted">{voice.description}</span>
                    </button>
                  ))}
                </div>
                {onSampleVoice ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled || sampling}
                      onClick={async () => {
                        setSampling(true);
                        try {
                          await onSampleVoice({ voice: narrationVoice, style: narrationStyle });
                        } finally {
                          setSampling(false);
                        }
                      }}
                    >
                      שמעו דוגמה
                    </Button>
                    <span className="text-sm text-muted">משפט קצר, מנצל מעט מהמכסה.</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Field label="הנחיות משלכם להקראה (לא חובה)" htmlFor="stage-narration-notes" hint="נוסף על הסגנון. למשל: לאט ובלחש בסוף.">
              <Textarea
                id="stage-narration-notes"
                rows={2}
                maxLength={300}
                value={hero?.narrationNotes ?? ""}
                onChange={(event) => changeHero({ narrationNotes: event.target.value })}
                disabled={disabled}
              />
            </Field>
            {narrationIgnored || (narrationInfo?.notesHonoured === false && !!hero?.narrationNotes?.trim()) ? (
              <p className="text-sm" role="status">
                הקול הנוכחי לא מקבל הנחיות חופשיות, אז רק הסגנון שבחרתם נלקח בחשבון.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {narrationMissing > 0 ? (
                <div className="flex flex-col gap-1">
                  <div>
                    <Button onClick={() => void runNarration("missing")} disabled={disabled || counts.withText === 0}>
                      <Mic aria-hidden="true" className="size-5" />
                      הקראה לעמודים שעדיין אין להם הקראה
                    </Button>
                  </div>
                  <p className="text-sm text-muted">
                    {narrationMissing === 1 ? "עמוד אחד מחכה להקראה." : `${narrationMissing} עמודים מחכים להקראה.`}
                  </p>
                </div>
              ) : (
                <p className="text-sm font-medium" role="note">
                  {counts.withText === 0 ? "אין עמודים עם טקסט להקריא." : "כל העמודים כבר מוקראים."}
                </p>
              )}
              {counts.withText > 0 ? (
                <div className="flex flex-col gap-1">
                  <div>
                    <Button variant="outline" onClick={() => void runNarration("all")} disabled={disabled}>
                      <Mic aria-hidden="true" className="size-5" />
                      הקראה מחדש של כל הספר בקול ובסגנון שנבחרו
                    </Button>
                  </div>
                  <p className="text-sm text-muted">מחליפה את ההקראה הקיימת בכל העמודים. הקלטה שלכם נשארת אלא אם תאשרו אחרת.</p>
                  {costs ? (
                    <CostLine
                      estimate={estimateNarration(costs, { chars: counts.textChars ?? counts.withText * 200 })}
                      costs={costs}
                      label="הקראה מחדש של כל הספר"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        }
      />

      {/* 6. Nikud */}
      <StageCard
        number={6}
        icon={Wand2}
        title="ניקוד"
        description="סימני ניקוד שעוזרים לקורא הצעיר."
        state={stageStates[6]}
        open={isOpen(6)}
        onToggle={() => toggle(6)}
        preview={() => <NikudPreview pages={created.pages} />}
        summary={`${counts.withNikud} מתוך ${counts.withText} עמודים מנוקדים`}
        cost={costLineFor("nikud")}
        manual={
          <>
            <p className="text-sm">נקדו ותקנו בשדה הניקוד בכל עמוד. תיקון ידני לא נדרס.</p>
            <div>
              <Button variant="outline" onClick={onGoToPages}>
                לניקוד בעמודים
              </Button>
            </div>
          </>
        }
        ai={
          <>
            <p className="text-sm">ניקוד אוטומטי לעמודים בלי ניקוד. כדאי לבדוק שמות בדויים.</p>
            <div>
              <Button variant={counts.withText > 0 && counts.withNikud >= counts.withText ? "outline" : "primary"} onClick={onNikudAll} disabled={disabled || counts.withText === 0}>
                <Wand2 aria-hidden="true" className="size-5" />
                ניקוד לכל העמודים
              </Button>
            </div>
          </>
        }
      />

      {/* 7. Animation */}
      <AnimationStage
        bookId={bookId}
        open={isOpen(7)}
        onToggle={() => toggle(7)}
        clipPaths={clipPaths}
        refresh={refreshClips}
        pages={previewPages}
        version={version}
        disabled={disabled}
        illustratedPages={illustratedPages}
        costs={costs}
        hero={hero}
        onHeroPatch={changeHero}
        ownClips={ownClips}
        onConfirm={onConfirm ?? ((request) => request.run())}
        onFlush={onFlush}
        onNotice={onNotice}
        onBusy={onBusy}
      />

      {/* 8. Book details */}
      <StageCard
        number={8}
        icon={ClipboardList}
        title="פרטי הספר"
        description="כותרת, תקציר, קטגוריות, תגיות ושאלות לשיחה. מתמלאים לבד עם כתיבת סיפור."
        state={stageStates[8]}
        open={isOpen(8)}
        onToggle={() => toggle(8)}
        preview={() => <DetailsPreview created={created} details={details} />}
        summary={
          details.missing.length > 0 ? `חסר: ${details.missing.join(", ")}` : `${details.done} מתוך ${details.total} פרטים מולאו`
        }
        cost={costLineFor("details")}
        manual={
          <>
            <p className="text-sm">ערכו הכול, כולל קרדיטים, רישיון וכריכה, בלשונית פרטי הספר.</p>
            <div>
              <Button variant="outline" onClick={onGoToDetails}>
                לפרטי הספר
              </Button>
            </div>
          </>
        }
        ai={
          <>
            <p className="text-sm">הכותב משלים פרטים ריקים לפי הסיפור. מה שכתבתם לא נדרס.</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={replaceDetails}
                onChange={(event) => setReplaceDetails(event.target.checked)}
              />
              <span>להחליף גם פרטים שכבר מולאו (הקרדיטים לא יוחלפו)</span>
            </label>
            <div>
              <Button variant={details.missing.length === 0 ? "outline" : "primary"} onClick={() => onAutoDetails({ replace: replaceDetails })} disabled={disabled || counts.withText === 0}>
                <Sparkles aria-hidden="true" className="size-5" />
                מילוי אוטומטי של הפרטים
              </Button>
            </div>
          </>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 7: animation
// ---------------------------------------------------------------------------

function AnimationStage({
  bookId,
  open,
  onToggle,
  clipPaths,
  refresh,
  pages,
  version,
  disabled,
  illustratedPages,
  costs,
  onFlush,
  onNotice,
  onBusy,
  hero,
  onHeroPatch,
  ownClips,
  onConfirm,
}: Pick<StagesPanelProps, "bookId" | "version" | "disabled" | "illustratedPages" | "costs" | "onFlush" | "onNotice" | "onBusy"> & {
  hero: BookHero | undefined;
  /** Changes one or more fields of the hero (saved with the book). */
  onHeroPatch: (patch: Partial<BookHero>) => void;
  /** Pages whose clip was uploaded by the user (not made by the AI). */
  ownClips: Set<number>;
  onConfirm: (request: { title: string; description: string; confirmLabel: string; run: () => void }) => void;
  open: boolean;
  onToggle: () => void;
  /** Page index to clip media path, fetched once by the panel. */
  clipPaths: Map<number, string>;
  refresh: () => Promise<void>;
  pages: CreatedPage[];
}) {
  const [running, setRunning] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState<number | null>(null);
  // One-off notes per page: not saved with the book.
  const [pageNotes, setPageNotes] = useState<Record<number, string>>({});
  const motion = hero?.animationMotion && ANIMATION_MOTIONS.some((m) => m.slug === hero.animationMotion) ? hero.animationMotion : DEFAULT_ANIMATION_MOTION;
  const clips = clipPaths;
  const fileInput = useRef<HTMLInputElement>(null);
  const targetPage = useRef(0);

  const fail = (err: unknown, fallback: string) =>
    onNotice({ tone: "error", text: err instanceof StudioApiError ? err.message : fallback });

  /** One picture at a time: it takes about a minute and costs money. `replace` is set after the user confirmed. */
  const animate = async (page: number, replace: boolean) => {
    if (running !== null) return;
    setRunning(page);
    onBusy({ label: `מנפיש את עמוד ${page + 1}. זה לוקח בערך דקה…`, expectedSeconds: EXPECTED_SECONDS.animation });
    try {
      if (!(await onFlush())) {
        onNotice({ tone: "error", text: "אי אפשר להנפיש לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      const notes = [hero?.animationNotes?.trim(), pageNotes[page]?.trim()].filter(Boolean).join(" ").slice(0, ANIMATION_NOTES_MAX);
      const outcome = await animatePageWithAi(bookId, page, {
        motion,
        ...(notes ? { notes } : {}),
        ...(replace ? { replace: true } : {}),
      });
      if (outcome.status === "animated") {
        onNotice({
          tone: "success",
          text: `עמוד ${page + 1} הונפש. אם התנועה לא מתאימה, אפשר ללחוץ על הנפשה מחדש.`,
          mock: outcome.videoSource === "mock" ? "video" : undefined,
        });
      } else if (outcome.status === "refused") {
        onNotice({ tone: "error", text: "שירות הווידאו סירב להנפיש את האיור (מסנן בטיחות). אפשר להחליף את האיור." });
      } else if (outcome.status === "failed") {
        onNotice({ tone: "error", text: outcome.error ?? "ההנפשה נכשלה" });
      } else {
        onNotice({ tone: "info", text: "לא היה מה להנפיש בעמוד הזה." });
      }
    } catch (err) {
      fail(err, "ההנפשה נכשלה");
    } finally {
      setRunning(null);
      onBusy(null);
      void refresh();
    }
  };

  const requestAnimate = (page: number) => {
    if (!clips.has(page)) {
      void animate(page, false);
      return;
    }
    if (ownClips.has(page)) {
      onConfirm({
        title: "להחליף את הקליפ שהעליתם?",
        description: `בעמוד ${page + 1} יש קליפ שהעליתם בעצמכם. הנפשה חדשה תחליף אותו, ויש לכך עלות.`,
        confirmLabel: "החלפה בהנפשה חדשה",
        run: () => void animate(page, true),
      });
      return;
    }
    void animate(page, true);
  };

  const attach = async (page: number, file: File) => {
    onBusy({ label: "מעלה את הקליפ…", expectedSeconds: EXPECTED_SECONDS.upload });
    try {
      // The server addresses pages by their saved order, so a pending reorder must land first.
      if (!(await onFlush())) {
        onNotice({ tone: "error", text: "אי אפשר להעלות קליפ לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      await attachPageClip(bookId, page, file, file.name);
      onNotice({ tone: "success", text: `הקליפ נשמר בעמוד ${page + 1}.` });
    } catch (err) {
      fail(err, "העלאת הקליפ נכשלה");
    } finally {
      onBusy(null);
      void refresh();
    }
  };

  const remove = async (page: number) => {
    onBusy({ label: "מסיר את ההנפשה…", expectedSeconds: EXPECTED_SECONDS.bookAction });
    try {
      if (!(await onFlush())) {
        onNotice({ tone: "error", text: "אי אפשר להסיר את הקליפ לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      await removePageClip(bookId, page);
    } catch (err) {
      fail(err, "הסרת ההנפשה נכשלה");
    } finally {
      onBusy(null);
      void refresh();
    }
  };

  const withClip = illustratedPages.filter((page) => clips.has(page)).length;
  const pageByIndex = new Map(pages.map((page) => [page.index, page]));

  return (
    <StageCard
      number={7}
      icon={Clapperboard}
      title="הנפשת התמונות"
      description="קליפ קצר ושקט שמניע את האיור. שלב לא חובה."
      state={stateOf(withClip, illustratedPages.length)}
      open={open}
      onToggle={onToggle}
      preview={() => <AnimationPreview pages={pages} version={version} />}
      summary={`${withClip} מתוך ${illustratedPages.length} איורים מונפשים`}
      cost={costs ? <CostLine estimate={estimateAnimation(costs, { clips: 1 })} costs={costs} label="הנפשת עמוד אחד" /> : undefined}
      manual={
        <>
          <p className="text-sm">יש לכם קליפ (MP4 או WebM, עד 25 מ״ב)? העלו אותו לעמוד.</p>
          {illustratedPages.length === 0 ? (
            <p className="text-sm text-muted">אין עדיין איורים להנפשה.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {illustratedPages.map((page) => (
                <li key={page} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-16 font-medium">עמוד {page + 1}</span>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    aria-label={`${clips.has(page) ? "החלפת קליפ" : "העלאת קליפ"} בעמוד ${page + 1}`}
                    onClick={() => {
                      targetPage.current = page;
                      fileInput.current?.click();
                    }}
                  >
                    <Upload aria-hidden="true" className="size-4" />
                    {clips.has(page) ? "החלפת קליפ" : "העלאת קליפ"}
                  </Button>
                  {clips.has(page) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      disabled={disabled}
                      aria-label={`הסרת ההנפשה מעמוד ${page + 1}`}
                      onClick={() => void remove(page)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      הסרה
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/webm"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void attach(targetPage.current, file);
            }}
          />
        </>
      }
      ai={
        <>
          <p className="text-sm">
            מנפישים עמוד אחד בכל פעם: כל הנפשה לוקחת בערך דקה ועולה כסף. בחרו סוג תנועה, הוסיפו הוראות אם רוצים, ולחצו על הנפשה ליד העמוד.
          </p>
          <div role="group" aria-label="סוג התנועה" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ANIMATION_MOTIONS.map((option) => (
              <button
                key={option.slug}
                type="button"
                aria-pressed={motion === option.slug}
                title={option.description}
                onClick={() => onHeroPatch({ animationMotion: option.slug })}
                disabled={disabled}
                className={cn(
                  "flex min-h-touch flex-col items-start rounded-md border-2 px-3 py-2 text-start",
                  motion === option.slug ? "border-primary bg-surface" : "border-border hover:bg-surface",
                )}
              >
                <span className="font-medium">
                  <span aria-hidden="true">{option.emoji} </span>
                  {option.label}
                </span>
                <span className="text-sm text-muted">{option.description}</span>
              </button>
            ))}
          </div>
          <Field
            label="הוראות מיוחדות להנפשה (לא חובה)"
            htmlFor="stage-animation-notes"
            hint="נוסף על סוג התנועה. למשל: הציפור מנפנפת בכנפיים, העננים זזים לאט. הסגנון של האיור והכללים לילדים נשמרים תמיד."
          >
            <Textarea
              id="stage-animation-notes"
              rows={2}
              maxLength={ANIMATION_NOTES_MAX}
              value={hero?.animationNotes ?? ""}
              onChange={(event) => onHeroPatch({ animationNotes: event.target.value })}
              disabled={disabled}
            />
          </Field>
          {illustratedPages.length === 0 ? (
            <p className="text-sm text-muted">אין עדיין איורים להנפשה. אפשר לאייר בשלב 4.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="הנפשה לפי עמוד">
              {illustratedPages.map((page) => {
                const info = pageByIndex.get(page);
                const has = clips.has(page);
                const open = noteOpen === page;
                return (
                  <li key={page} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <PageClipThumb image={info?.image} video={info?.video} version={version} index={page} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium">עמוד {page + 1}</span>
                        <span className="text-sm text-muted">{has ? "יש קליפ" : "עוד אין קליפ"}</span>
                      </div>
                      <Button
                        variant={has ? "outline" : "primary"}
                        disabled={disabled || running !== null}
                        loading={running === page}
                        aria-label={`${has ? "הנפשה מחדש" : "הנפשה"} של עמוד ${page + 1}${
                          costs ? `, ${costLine(estimateAnimation(costs, { clips: 1 }), costs)}` : ""
                        }`}
                        onClick={() => requestAnimate(page)}
                      >
                        <Clapperboard aria-hidden="true" className="size-4" />
                        {has ? "הנפשה מחדש" : "הנפשה"}
                      </Button>
                    </div>
                    <div>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setNoteOpen(open ? null : page)}
                        className="min-h-touch text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        הוראה לעמוד הזה
                      </button>
                      {open ? (
                        <Input
                          aria-label={`הוראה להנפשת עמוד ${page + 1}`}
                          maxLength={200}
                          placeholder="למשל: הילדה מנופפת לשלום"
                          value={pageNotes[page] ?? ""}
                          onChange={(event) => setPageNotes((current) => ({ ...current, [page]: event.target.value }))}
                          disabled={disabled}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      }
    />
  );
}

