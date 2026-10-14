"use client";

import { AArrowDown, AArrowUp, Timer } from "lucide-react";
import { Button, Chip, Dialog } from "@/components/ui";
import { FONT_SIZES_REM, PLAYBACK_RATES, SLEEP_TIMER_MINUTES, formatCountdown } from "@/lib/reader/logic";
import type { TextLayout } from "@/lib/reader/storage";

const TEXT_LAYOUTS: { value: TextLayout; label: string }[] = [
  { value: "side", label: "ליד התמונה" },
  { value: "below", label: "תמיד מתחת לתמונה" },
  { value: "hidden", label: "בלי טקסט" },
];

const RATE_LABELS: Record<number, string> = { 0.75: "לאט", 1: "רגיל", 1.25: "מהר" };

export function rateLabel(rate: number): string {
  return RATE_LABELS[rate] ?? `×${rate}`;
}

export interface ReaderSettingsProps {
  open: boolean;
  onClose: () => void;
  fontStep: number;
  onFontStep: (step: number) => void;
  textLayout: TextLayout;
  onTextLayout: (layout: TextLayout) => void;
  /** "Living pictures": gentle motion over the illustrations and the clips of animated pages. */
  liveImages: boolean;
  onLiveImages: (value: boolean) => void;
  /** The device asks for less motion, which keeps the pictures still whatever this setting says. */
  reducedMotion?: boolean;
  hasAudio: boolean;
  rate: number;
  onRate: (rate: number) => void;
  autoAdvance: boolean;
  onAutoAdvance: (value: boolean) => void;
  /** Seconds left on the sleep timer, or null. */
  sleepRemaining: number | null;
  onSleepStart: (minutes: number) => void;
  onSleepCancel: () => void;
}

/** Grown-up controls: text size and placement, living pictures, narration speed, automatic page turning and the sleep timer. */
export function ReaderSettings({
  open,
  onClose,
  fontStep,
  onFontStep,
  textLayout,
  onTextLayout,
  liveImages,
  onLiveImages,
  reducedMotion = false,
  hasAudio,
  rate,
  onRate,
  autoAdvance,
  onAutoAdvance,
  sleepRemaining,
  onSleepStart,
  onSleepCancel,
}: ReaderSettingsProps) {
  const maxStep = FONT_SIZES_REM.length - 1;
  return (
    <Dialog open={open} onClose={onClose} title="הגדרות קריאה" size="md">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="reader-font-title">
          <h3 id="reader-font-title" className="mb-2 text-lg font-bold">
            גודל האותיות
          </h3>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="להקטין את האותיות"
              disabled={fontStep <= 0}
              onClick={() => onFontStep(fontStep - 1)}
            >
              <AArrowDown aria-hidden="true" />
            </Button>
            <p
              className="story-text min-w-0 flex-1 truncate text-center"
              style={{ fontSize: `${FONT_SIZES_REM[fontStep]}rem`, lineHeight: 1.4 }}
              aria-live="polite"
            >
              אבג
              <span className="sr-only">
                , גודל {fontStep + 1} מתוך {maxStep + 1}
              </span>
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label="להגדיל את האותיות"
              disabled={fontStep >= maxStep}
              onClick={() => onFontStep(fontStep + 1)}
            >
              <AArrowUp aria-hidden="true" />
            </Button>
          </div>
        </section>

        <section aria-labelledby="reader-layout-title">
          <h3 id="reader-layout-title" className="mb-2 text-lg font-bold">
            מיקום הטקסט
          </h3>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="מיקום הטקסט">
            {TEXT_LAYOUTS.map(({ value, label }) => (
              <Chip key={value} selected={textLayout === value} tone="secondary" onClick={() => onTextLayout(value)}>
                {label}
              </Chip>
            ))}
          </div>
          {textLayout === "side" ? (
            <p className="mt-2 text-sm text-muted">
              בתמונה מרובעת או גבוהה הטקסט יופיע לצידה. בתמונה רחבה או במסך צר הוא יופיע מתחתיה.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="reader-pictures-title">
          <h3 id="reader-pictures-title" className="mb-2 text-lg font-bold">
            איורים
          </h3>
          <label className="flex min-h-touch cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="size-6 accent-[var(--secondary)]"
              checked={liveImages}
              onChange={(event) => onLiveImages(event.target.checked)}
            />
            <span>תמונות חיות</span>
          </label>
          <p className="mt-1 text-sm text-muted">
            {reducedMotion
              ? "המכשיר מוגדר להפחתת תנועה, ולכן האיורים נשארים דוממים."
              : "תנועה איטית ועדינה באיורים, וסרטון קצר בעמודים שהאיור שלהם הונפש. כשהאפשרות כבויה האיורים דוממים."}
          </p>
        </section>

        <section aria-labelledby="reader-audio-title">
          <h3 id="reader-audio-title" className="mb-2 text-lg font-bold">
            הקראה
          </h3>
          {hasAudio ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="מהירות ההקראה">
                <span className="text-muted">מהירות:</span>
                {PLAYBACK_RATES.map((value) => (
                  <Chip key={value} selected={rate === value} tone="secondary" onClick={() => onRate(value)}>
                    {rateLabel(value)}
                  </Chip>
                ))}
              </div>
              <label className="flex min-h-touch cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-6 accent-[var(--secondary)]"
                  checked={autoAdvance}
                  onChange={(event) => onAutoAdvance(event.target.checked)}
                />
                <span>לעבור לעמוד הבא לבד בסוף ההקראה</span>
              </label>
            </div>
          ) : (
            <p className="text-muted">לספר הזה אין עדיין הקראה. אפשר לקרוא אותו יחד בקול.</p>
          )}
        </section>

        <section aria-labelledby="reader-sleep-title">
          <h3 id="reader-sleep-title" className="mb-2 flex items-center gap-2 text-lg font-bold">
            <Timer aria-hidden="true" className="size-5" />
            טיימר שינה
          </h3>
          <p className="mb-3 text-muted">בסוף הזמן ההקראה נעצרת והמסך מחשיך.</p>
          <div className="flex flex-wrap items-center gap-2">
            {SLEEP_TIMER_MINUTES.map((minutes) => (
              <Chip key={minutes} tone="primary" onClick={() => onSleepStart(minutes)}>
                {minutes} דקות
              </Chip>
            ))}
          </div>
          {sleepRemaining !== null ? (
            <p className="mt-3 flex flex-wrap items-center gap-3" role="status">
              <span>
                נשארו <strong dir="ltr">{formatCountdown(sleepRemaining)}</strong>
              </span>
              <Button variant="outline" size="sm" onClick={onSleepCancel}>
                לבטל את הטיימר
              </Button>
            </p>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
