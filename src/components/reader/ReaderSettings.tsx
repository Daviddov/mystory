"use client";

import { AArrowDown, AArrowUp, Moon, Timer } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Chip, Dialog } from "@/components/ui";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { FONT_SIZES_REM, SLEEP_TIMER_MINUTES, formatCountdown } from "@/lib/reader/logic";
import { textDirection, type BookLanguage } from "@/lib/types";
import { SpeedControl } from "./SpeedControl";

/** Letters of the text-size sample, in the language of the story being read. */
const SAMPLES: Record<BookLanguage, string> = { he: "אבג", en: "Abc", ar: "أبج" };

export interface ReaderSettingsProps {
  open: boolean;
  onClose: () => void;
  fontStep: number;
  onFontStep: (step: number) => void;
  /** Whether the story text is shown next to / under the picture. */
  showText: boolean;
  onShowText: (value: boolean) => void;
  /** The book has a vocalized version; without one the nikud switch is disabled. */
  nikudAvailable: boolean;
  /** Language of the story text, for the text-size sample. Default Hebrew. */
  sampleLanguage?: BookLanguage;
  /** Languages the text can be shown in (the book's own and its versions); the picker shows only with two or more. */
  textLanguages?: BookLanguage[];
  /** The language the text is shown in now, and the one being narrated. */
  textLanguage?: BookLanguage;
  narratedLanguage?: BookLanguage;
  onTextLanguage?: (language: BookLanguage) => void;
  nikud: boolean;
  onNikud: (value: boolean) => void;
  /** Starts the "listening before sleep" mode: dim theme, narration and a sleep timer. */
  onBedtimeListen: () => void;
  hasAudio: boolean;
  /** The book has background music under its narration. */
  hasSoundtrack?: boolean;
  soundtrack?: boolean;
  onSoundtrack?: (value: boolean) => void;
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
  showText,
  onShowText,
  nikudAvailable,
  sampleLanguage = "he",
  textLanguages = [],
  textLanguage,
  narratedLanguage,
  onTextLanguage,
  nikud,
  onNikud,
  onBedtimeListen,
  hasAudio,
  hasSoundtrack = false,
  soundtrack = false,
  onSoundtrack,
  rate,
  onRate,
  autoAdvance,
  onAutoAdvance,
  sleepRemaining,
  onSleepStart,
  onSleepCancel,
}: ReaderSettingsProps) {
  const maxStep = FONT_SIZES_REM.length - 1;
  const t = READER_MESSAGES[useLocale()].settings;
  return (
    <Dialog open={open} onClose={onClose} title={t.title} size="md">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="reader-font-title">
          <h3 id="reader-font-title" className="mb-2 text-lg font-bold">
            {t.fontSize}
          </h3>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label={t.smaller}
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
              <span lang={sampleLanguage} dir={textDirection(sampleLanguage)}>
                {SAMPLES[sampleLanguage]}
              </span>
              <span className="sr-only">{t.sizeOf(fontStep + 1, maxStep + 1)}</span>
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label={t.bigger}
              disabled={fontStep >= maxStep}
              onClick={() => onFontStep(fontStep + 1)}
            >
              <AArrowUp aria-hidden="true" />
            </Button>
          </div>
        </section>

        {textLanguages.length > 1 && onTextLanguage ? (
          <section aria-labelledby="reader-textlang-title">
            <h3 id="reader-textlang-title" className="mb-2 text-lg font-bold">
              {t.textLanguage}
            </h3>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.textLanguage}>
              {textLanguages.map((language) => (
                <Chip
                  key={language}
                  selected={textLanguage === language}
                  tone="secondary"
                  onClick={() => onTextLanguage(language)}
                >
                  {t.languageName(language)}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              {narratedLanguage && textLanguage && narratedLanguage !== textLanguage
                ? t.textLanguageSeparate(t.languageName(narratedLanguage))
                : t.textLanguageHint}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="reader-nikud-title">
          <h3 id="reader-nikud-title" className="mb-2 text-lg font-bold">
            {t.nikud}
          </h3>
          <label className={`flex min-h-touch items-center gap-3 ${nikudAvailable ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="checkbox"
              className="size-6 accent-[var(--secondary)]"
              checked={nikudAvailable && nikud}
              disabled={!nikudAvailable}
              onChange={(event) => onNikud(event.target.checked)}
            />
            <span>{t.showNikud}</span>
          </label>
          {nikudAvailable ? null : <p className="mt-1 text-sm text-muted">{t.noNikud}</p>}
        </section>

        <section aria-labelledby="reader-layout-title">
          <h3 id="reader-layout-title" className="mb-2 text-lg font-bold">
            {t.layout}
          </h3>
          <label className="flex min-h-touch cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="size-6 accent-[var(--secondary)]"
              checked={showText}
              onChange={(event) => onShowText(event.target.checked)}
            />
            <span>{t.showText}</span>
          </label>
        </section>

        <section aria-labelledby="reader-audio-title">
          <h3 id="reader-audio-title" className="mb-2 text-lg font-bold">
            {t.narration}
          </h3>
          {hasAudio ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-muted" aria-hidden="true">
                  {t.speed}
                </span>
                <SpeedControl rate={rate} onRate={onRate} />
              </div>
              <label className="flex min-h-touch cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-6 accent-[var(--secondary)]"
                  checked={autoAdvance}
                  onChange={(event) => onAutoAdvance(event.target.checked)}
                />
                <span>{t.autoAdvance}</span>
              </label>
              {hasSoundtrack ? (
                <label className="flex min-h-touch cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-6 accent-[var(--secondary)]"
                    checked={soundtrack}
                    onChange={(event) => onSoundtrack?.(event.target.checked)}
                  />
                  <span>{t.soundtrack}</span>
                </label>
              ) : null}
            </div>
          ) : (
            <p className="text-muted">{t.noAudio}</p>
          )}
        </section>

        {hasAudio ? (
          <section aria-labelledby="reader-bedtime-title">
            <h3 id="reader-bedtime-title" className="mb-2 flex items-center gap-2 text-lg font-bold">
              <Moon aria-hidden="true" className="size-5" />
              {t.bedtime}
            </h3>
            <p className="mb-3 text-muted">{t.bedtimeHint}</p>
            <Button variant="secondary" onClick={onBedtimeListen}>
              {t.bedtimeStart}
            </Button>
          </section>
        ) : null}

        <section aria-labelledby="reader-sleep-title">
          <h3 id="reader-sleep-title" className="mb-2 flex items-center gap-2 text-lg font-bold">
            <Timer aria-hidden="true" className="size-5" />
            {t.sleepTimer}
          </h3>
          <p className="mb-3 text-muted">{t.sleepHint}</p>
          <div className="flex flex-wrap items-center gap-2">
            {SLEEP_TIMER_MINUTES.map((minutes) => (
              <Chip key={minutes} tone="primary" onClick={() => onSleepStart(minutes)}>
                {t.minutes(minutes)}
              </Chip>
            ))}
          </div>
          {sleepRemaining !== null ? (
            <p className="mt-3 flex flex-wrap items-center gap-3" role="status">
              <span>
                {t.left} <strong dir="ltr">{formatCountdown(sleepRemaining)}</strong>
              </span>
              <Button variant="outline" size="sm" onClick={onSleepCancel}>
                {t.cancelTimer}
              </Button>
            </p>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
