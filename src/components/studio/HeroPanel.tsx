"use client";

import { ChevronDown, Paintbrush, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, Field, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ILLUSTRATION_STYLES } from "@/lib/generation/presets";
import { mediaUrl } from "@/lib/media/url";
import { DEFAULT_ILLUSTRATION_STYLE, IMAGE_ACCEPT, MAX_HERO_DESCRIPTION } from "@/lib/studio/shared";
import type { BookHero } from "@/lib/types";

export interface HeroPanelProps {
  hero: BookHero | undefined;
  /** Cache-busting version for media URLs. */
  version?: string;
  /** Pages that have text and no picture yet. */
  missingImages: number;
  /** undefined removes the hero. */
  onChange: (hero: BookHero | undefined) => void;
  /** Draws the hero image. An empty description asks the server to write one from the story. */
  onGenerate: (description: string, style: string) => void;
  onUpload: (file: File) => void;
  onIllustrateMissing: () => void;
}

/**
 * The hero of the book: a description, a style and a reference image. Every
 * page illustration is drawn from it, so the character stays the same.
 */
export function HeroPanel({
  hero,
  version,
  missingImages,
  onChange,
  onGenerate,
  onUpload,
  onIllustrateMissing,
}: HeroPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(!hero?.image);
  const description = hero?.description ?? "";
  const style = hero?.style ?? DEFAULT_ILLUSTRATION_STYLE;
  const image = mediaUrl(hero?.image, version);

  const change = (patch: Partial<BookHero>) => {
    const next: BookHero = { ...hero, description, style, ...patch };
    onChange(next);
  };

  return (
    <Card as="section" aria-labelledby="hero-panel-title" className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="hero-panel-body"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 text-start"
      >
        {image ? (
          <img src={image} alt="" className="size-14 shrink-0 rounded-md border border-border bg-surface-2 object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
            <UserRound aria-hidden="true" className="size-7" />
          </span>
        )}
        <span className="flex flex-1 flex-col">
          <h2 id="hero-panel-title" className="text-xl font-bold">
            הגיבור של הסיפור
          </h2>
          <span className="text-muted">
            {image
              ? "האיורים של העמודים נוצרים לפי התמונה הזאת, כדי שהגיבור ייראה אותו דבר בכל עמוד."
              : "צרו תמונה של הגיבור, ואז אפשר ליצור איור לכל עמוד לפי הגיבור, הסיפור והעמוד."}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-6 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div id="hero-panel-body" className="grid gap-5 md:grid-cols-[14rem_1fr]">
          <div className="flex flex-col gap-2">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-border-strong bg-surface-2">
              {image ? (
                <img src={image} alt="תמונת הגיבור" className="size-full object-contain" />
              ) : (
                <UserRound aria-hidden="true" className="size-16 text-muted" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden="true" className="size-4" />
                העלאת תמונה
              </Button>
              {hero ? (
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => onChange(undefined)}>
                  <Trash2 aria-hidden="true" className="size-4" />
                  הסרה
                </Button>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUpload(file);
              }}
            />
          </div>

          <div className="flex flex-col gap-4">
            <Field
              label="איך הגיבור נראה?"
              htmlFor="hero-description"
              hint="גיל, שיער, צבע עור, בגדים בצבעים קבועים ופרט אחד מיוחד. אם תשאירו ריק, נכתוב תיאור לפי הסיפור."
            >
              <Textarea
                id="hero-description"
                rows={4}
                maxLength={MAX_HERO_DESCRIPTION}
                value={description}
                onChange={(event) => change({ description: event.target.value })}
                placeholder="למשל: ילדה בת שש עם צמה ג'ינג'ית, חולצה צהובה, מכנסיים כחולים ומגפיים אדומים"
              />
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">סגנון האיור</legend>
              <div className="flex flex-wrap gap-2">
                {ILLUSTRATION_STYLES.map((option) => (
                  <button
                    key={option.slug}
                    type="button"
                    aria-pressed={style === option.slug}
                    onClick={() => change({ style: option.slug })}
                    className={cn(
                      "min-h-touch rounded-full border-2 px-4 font-medium",
                      style === option.slug ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span aria-hidden="true">{option.emoji} </span>
                    {option.label}
                  </button>
                ))}
              </div>
              {hero?.image ? (
                <p className="text-sm text-muted">שינוי הסגנון ישפיע על האיורים הבאים. כדאי ליצור גם את הגיבור מחדש באותו סגנון.</p>
              ) : null}
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onGenerate(description.trim(), style)}>
                <Sparkles aria-hidden="true" className="size-5" />
                {image ? "יצירת הגיבור מחדש" : "יצירת תמונת הגיבור"}
              </Button>
              {hero ? (
                <Button variant="secondary" onClick={onIllustrateMissing} disabled={missingImages === 0}>
                  <Paintbrush aria-hidden="true" className="size-5" />
                  {missingImages > 0 ? `איור ${missingImages} העמודים שאין להם תמונה` : "לכל העמודים יש תמונה"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
